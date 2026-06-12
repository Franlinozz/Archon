import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { githubAppConfigured, verifyWebhookSignature } from "@/lib/github/app";
import { enqueueGithubJob } from "@/lib/queue/github";
import { redisReady } from "@/lib/queue/redis";

export const dynamic = "force-dynamic";

// GitHub App webhook receiver. Verifies X-Hub-Signature-256, stores
// installation lifecycle, and enqueues PR / autofix work — replies 202 fast,
// all heavy lifting happens in the worker.
export async function POST(request: Request) {
  if (!githubAppConfigured()) return NextResponse.json({ error: "GitHub App is not configured on this deployment." }, { status: 503 });
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  const event = request.headers.get("x-github-event") ?? "";
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  try {
    if (event === "installation") {
      const installation = payload.installation as { id: number; account?: { login?: string }; suspended_at?: string | null };
      const action = String(payload.action);
      if (action === "deleted") await db.query(`delete from github_installations where installation_id=$1`, [installation.id]);
      else await db.query(
        `insert into github_installations (installation_id, account_login, suspended) values ($1,$2,$3)
         on conflict (installation_id) do update set account_login=excluded.account_login, suspended=excluded.suspended`,
        [installation.id, installation.account?.login ?? null, action === "suspend"],
      );
      return NextResponse.json({ ok: true });
    }

    if (event === "pull_request" && ["opened", "synchronize", "reopened"].includes(String(payload.action))) {
      if (!redisReady()) return NextResponse.json({ error: "Queue unavailable." }, { status: 503 });
      const pr = payload.pull_request as { number: number; head: { sha: string; ref: string } };
      const repo = payload.repository as { name: string; owner: { login: string } };
      const installation = payload.installation as { id: number };
      await enqueueGithubJob({ kind: "pr", installationId: installation.id, owner: repo.owner.login, repo: repo.name, prNumber: pr.number, headSha: pr.head.sha, headRef: pr.head.ref });
      return NextResponse.json({ queued: true }, { status: 202 });
    }

    if (event === "issue_comment" && String(payload.action) === "created") {
      const comment = payload.comment as { body?: string; user?: { login?: string; type?: string } };
      const issue = payload.issue as { number: number; pull_request?: unknown };
      const match = comment.body?.match(/^\/archon\s+fix\s+([0-9a-f-]{36})\s*$/im);
      if (match && issue.pull_request && comment.user?.type !== "Bot") {
        if (!redisReady()) return NextResponse.json({ error: "Queue unavailable." }, { status: 503 });
        const repo = payload.repository as { name: string; owner: { login: string } };
        const installation = payload.installation as { id: number };
        await enqueueGithubJob({ kind: "autofix", installationId: installation.id, owner: repo.owner.login, repo: repo.name, prNumber: issue.number, optimizationId: match[1]!.toLowerCase(), requestedBy: comment.user?.login ?? "unknown" });
        return NextResponse.json({ queued: true }, { status: 202 });
      }
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error), event }, "github webhook handling failed");
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }
  return NextResponse.json({ ignored: true });
}
