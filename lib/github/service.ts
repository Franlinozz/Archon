import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { runScan } from "@/lib/scan/runner";
import { createGasReport, runApplyPatch, runGasReport } from "@/lib/gas/service";
import { breachesFailOn, parseArchonConfig, pathAllowed, ruleAllowed, type ArchonConfig } from "@/lib/ci/config";
import { gh, installationToken, repoFile } from "@/lib/github/app";

// GitHub App PR handler (F3): scoped scan of changed Solidity, ONE updating
// check-run + ONE updating comment (found by marker / stored ids — never
// re-posted on force-push), policy gates from archon.config.json, and autofix
// for catalog-SAFE gas optimizations only: Archon pushes its own
// archon/fix-<id> branch and opens a PR — never touches user branches.

const MARKER = "<!-- archon-app -->";
const BASE_URL = process.env.ARCHON_PUBLIC_BASE_URL ?? "https://archonaudit.xyz";

export type GithubJob =
  | { kind: "pr"; installationId: number; owner: string; repo: string; prNumber: number; headSha: string; headRef: string }
  | { kind: "autofix"; installationId: number; owner: string; repo: string; prNumber: number; optimizationId: string; requestedBy: string };

type PrFile = { filename: string; status: string };
type FindingRow = { id: string; severity: string; title: string; file: string; line_start: number | null };

const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export async function handleGithubJob(job: GithubJob) {
  if (job.kind === "pr") return handlePr(job);
  return handleAutofix(job);
}

async function upsertState(job: Extract<GithubJob, { kind: "pr" }>) {
  const row = (await db.query<{ id: string; comment_id: string | null; check_run_id: string | null }>(
    `insert into github_pr_state (installation_id, owner, repo, pr_number, head_sha, head_ref)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (owner, repo, pr_number) do update set head_sha=excluded.head_sha, head_ref=excluded.head_ref, updated_at=now()
     returning id, comment_id, check_run_id`,
    [job.installationId, job.owner, job.repo, job.prNumber, job.headSha, job.headRef],
  )).rows[0]!;
  return row;
}

async function handlePr(job: Extract<GithubJob, { kind: "pr" }>) {
  const token = await installationToken(job.installationId);
  const state = await upsertState(job);
  const repoPath = `/repos/${job.owner}/${job.repo}`;
  const externalId = `archon-${job.owner}/${job.repo}#${job.prNumber}`;

  // One check-run per PR, updated in place (created fresh per head SHA so the
  // check attaches to the right commit; external_id keeps it identifiable).
  const check = await gh<{ id: number }>(token, "POST", `${repoPath}/check-runs`, {
    name: "Archon / Mantle audit + gas", head_sha: job.headSha, external_id: externalId, status: "in_progress",
  });
  await db.query(`update github_pr_state set check_run_id=$2 where id=$1`, [state.id, check.id]);

  try {
    const configRaw = await repoFile(token, job.owner, job.repo, "archon.config.json", job.headSha);
    const { config, error: configError } = parseArchonConfig(configRaw);

    const files = await gh<PrFile[]>(token, "GET", `${repoPath}/pulls/${job.prNumber}/files?per_page=100`);
    const solFiles = files.filter((f) => f.filename.endsWith(".sol") && f.status !== "removed" && pathAllowed(f.filename, config)).slice(0, 40);
    if (!solFiles.length) {
      await gh(token, "PATCH", `${repoPath}/check-runs/${check.id}`, { status: "completed", conclusion: "neutral", output: { title: "No Solidity changes in scope", summary: "Archon scans changed .sol files (after archon.config.json path filters); this PR has none." } });
      return;
    }

    const sources = (await Promise.all(solFiles.map(async (f) => ({ path: f.filename, source: (await repoFile(token, job.owner, job.repo, f.filename, job.headSha)) ?? "" })))).filter((f) => f.source);
    const entry = [...sources].sort((a, b) => b.source.length - a.source.length)[0]!;

    // Scoped audit scan through the normal pipeline (synchronously inside this job).
    const scanRow = (await db.query<{ id: string }>(
      `insert into scans (source_kind, source_ref, source_code, source_bundle, network, scan_depth, protocols, status, progress, current_stage, created_at)
       values ('paste', $1, $2, $3::jsonb, 'mantle-mainnet', 'quick', '["mETH"]'::jsonb, 'queued', 0, 'Queued', now()) returning id`,
      [`${job.owner}/${job.repo}#${job.prNumber}`, entry.source, JSON.stringify(sources)],
    )).rows[0]!;
    await runScan(scanRow.id);
    const report = (await db.query<{ id: string; risk_score: number }>(`select id, risk_score from reports where scan_id=$1 order by created_at desc limit 1`, [scanRow.id])).rows[0];
    const findings = report ? (await db.query<FindingRow>(`select id, severity, title, file, line_start from findings where report_id=$1 order by sort_index nulls last, id`, [report.id])).rows : [];

    // Gas engine (optional via config), entry file only.
    let gas: { id: string; totals: { l2GasSavedPerCall?: number; split?: { l2WeiPerCall?: string; l1DaWeiPerCall?: string } } | null; optimizations: Array<{ id: string; rule_id: string; title: string; safety: string; est_l2_delta: number | null; patch: unknown }> } | null = null;
    if (config.gas !== false) {
      const created = await createGasReport({ sourceKind: "paste", sourceCode: entry.source, contractLabel: `${job.repo}#${job.prNumber}` });
      await runGasReport(created.id);
      const g = (await db.query<{ id: string; totals: { l2GasSavedPerCall?: number } | null }>(`select id, totals from gas_reports where id=$1`, [created.id])).rows[0];
      const opts = (await db.query<{ id: string; rule_id: string; title: string; safety: string; est_l2_delta: number | null; patch: unknown }>(
        `select id, rule_id, title, safety, est_l2_delta, patch from gas_optimizations where gas_report_id=$1 order by rank_score desc nulls last limit 12`, [created.id],
      )).rows;
      gas = g ? { ...g, optimizations: opts.filter((o) => ruleAllowed(o.rule_id, config)) } : null;
      await db.query(`update github_pr_state set gas_report_id=$2, source_path=$3 where id=$1`, [state.id, created.id, entry.path]);
    }
    await db.query(`update github_pr_state set scan_id=$2, report_id=$3 where id=$1`, [state.id, scanRow.id, report?.id ?? null]);

    const breaches = breachesFailOn(findings, config.failOn);
    const gasSaved = gas?.totals?.l2GasSavedPerCall ?? 0;
    const gasRegression = config.maxRegressionL2Gas !== undefined && gasSaved < -Math.abs(config.maxRegressionL2Gas);
    const failed = breaches.length > 0 || gasRegression;

    const body = composeComment({ job, report, findings, gas, config, configError, entryPath: entry.path });
    await upsertComment(token, job, state.id, state.comment_id ? Number(state.comment_id) : null, body);

    await gh(token, "PATCH", `${repoPath}/check-runs/${check.id}`, {
      status: "completed",
      conclusion: failed ? "failure" : "success",
      output: {
        title: failed
          ? `${breaches.length ? `${breaches.length} finding(s) ≥ ${config.failOn}` : ""}${breaches.length && gasRegression ? " · " : ""}${gasRegression ? "gas regression" : ""}`
          : `risk ${report?.risk_score ?? "—"} · ${findings.length} finding(s) · no policy breach`,
        summary: `Full report: ${BASE_URL}/r/${report?.id ?? ""}\n\nPolicy: archon.config.json ${configRaw ? "(loaded)" : "(absent — defaults)"}${configError ? `\n⚠ ${configError}` : ""}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: message, pr: externalId }, "github pr handler failed");
    await gh(token, "PATCH", `${repoPath}/check-runs/${check.id}`, { status: "completed", conclusion: "failure", output: { title: "Archon could not complete this run", summary: message.slice(0, 600) } }).catch(() => null);
  }
}

function composeComment(args: { job: Extract<GithubJob, { kind: "pr" }>; report: { id: string; risk_score: number } | undefined; findings: FindingRow[]; gas: { id: string; totals: { l2GasSavedPerCall?: number; split?: { l2WeiPerCall?: string; l1DaWeiPerCall?: string } } | null; optimizations: Array<{ id: string; rule_id: string; title: string; safety: string; est_l2_delta: number | null; patch: unknown }> } | null; config: ArchonConfig; configError: string | null; entryPath: string }) {
  const { job, report, findings, gas, config, configError } = args;
  const blob = (file: string, line: number | null) => `https://github.com/${job.owner}/${job.repo}/blob/${job.headSha}/${file}${line ? `#L${line}` : ""}`;
  const top = [...findings].sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9)).slice(0, 10);
  const findingRows = top.length
    ? top.map((f) => `| ${f.severity} | ${f.title.replace(/\|/g, "\\|")} | [${f.file}:${f.line_start ?? "—"}](${blob(args.entryPath === f.file ? f.file : args.entryPath, f.line_start)}) |`).join("\n")
    : "| — | No findings | — |";
  const autofixable = (gas?.optimizations ?? []).filter((o) => o.safety === "safe" && o.patch);
  const split = gas?.totals?.split;
  return `${MARKER}
## Archon — Mantle audit & gas

**Risk score:** ${report?.risk_score ?? "—"}/100 · **Findings:** ${findings.length} · [Full report](${BASE_URL}/r/${report?.id ?? ""})${configError ? `\n\n> ⚠ ${configError}` : ""}

| Severity | Finding | Location |
| --- | --- | --- |
${findingRows}
${findings.length > 10 ? `\n_… ${findings.length - 10} more in the [full report](${BASE_URL}/r/${report?.id ?? ""})._\n` : ""}
${gas ? `**Gas (identified savings/call):** ${Number(gas.totals?.l2GasSavedPerCall ?? 0).toLocaleString()} L2 gas · split L2 ${split?.l2WeiPerCall ?? "0"} wei / DA ${split?.l1DaWeiPerCall ?? "0"} wei _(estimates; DA priced from receipt ground truth)_ · [gas report](${BASE_URL}/app/gas/${gas.id})` : "_Gas engine disabled by archon.config.json._"}
${autofixable.length ? `
### Autofix available (catalog-safe rules only)
${autofixable.map((o) => `- **${o.title}** (\`${o.rule_id}\`, est. ${o.est_l2_delta ?? "—"} gas/call) — comment \`/archon fix ${o.id}\``).join("\n")}

Archon validates the patch by compilation, then opens its own \`archon/fix-…\` PR — it never pushes to your branches.` : ""}
${config.failOn ? `\n_Policy: fail on ≥ ${config.failOn}${config.maxRegressionL2Gas !== undefined ? ` · max L2 regression ${config.maxRegressionL2Gas}` : ""}._` : ""}`;
}

async function upsertComment(token: string, job: { owner: string; repo: string; prNumber: number }, stateId: string, knownId: number | null, body: string) {
  const repoPath = `/repos/${job.owner}/${job.repo}`;
  if (knownId) {
    try { await gh(token, "PATCH", `${repoPath}/issues/comments/${knownId}`, { body }); return; } catch { /* fall through to search */ }
  }
  const comments = await gh<Array<{ id: number; body?: string }>>(token, "GET", `${repoPath}/issues/${job.prNumber}/comments?per_page=100`);
  const mine = comments.find((c) => c.body?.includes(MARKER));
  if (mine) {
    await gh(token, "PATCH", `${repoPath}/issues/comments/${mine.id}`, { body });
    await db.query(`update github_pr_state set comment_id=$2 where id=$1`, [stateId, mine.id]);
  } else {
    const created = await gh<{ id: number }>(token, "POST", `${repoPath}/issues/${job.prNumber}/comments`, { body });
    await db.query(`update github_pr_state set comment_id=$2 where id=$1`, [stateId, created.id]);
  }
}

async function handleAutofix(job: Extract<GithubJob, { kind: "autofix" }>) {
  const token = await installationToken(job.installationId);
  const repoPath = `/repos/${job.owner}/${job.repo}`;
  const reply = (body: string) => gh(token, "POST", `${repoPath}/issues/${job.prNumber}/comments`, { body });

  const state = (await db.query<{ gas_report_id: string | null; head_ref: string | null; head_sha: string | null; source_path: string | null }>(
    `select gas_report_id, head_ref, head_sha, source_path from github_pr_state where owner=$1 and repo=$2 and pr_number=$3`, [job.owner, job.repo, job.prNumber],
  )).rows[0];
  if (!state?.gas_report_id) { await reply(`${MARKER}-autofix\n@${job.requestedBy} I don't have a gas report for this PR yet — push a commit to re-run the Archon check first.`); return; }

  const opt = (await db.query<{ id: string; rule_id: string; title: string; safety: string; patch: { oldText: string; newText: string } | null }>(
    `select id, rule_id, title, safety, patch from gas_optimizations where id=$1 and gas_report_id=$2`, [job.optimizationId, state.gas_report_id],
  )).rows[0];
  if (!opt?.patch) { await reply(`${MARKER}-autofix\n@${job.requestedBy} that optimization id doesn't belong to this PR's gas report.`); return; }
  if (opt.safety !== "safe") { await reply(`${MARKER}-autofix\n@${job.requestedBy} \`${opt.rule_id}\` is a review-class rule; Archon only autofixes catalog-safe rules.`); return; }

  // Compile-validate the patch through the existing apply pipeline.
  await runApplyPatch(state.gas_report_id, opt.id);
  const diff = (await db.query<{ gas_diff: { status?: string; label?: string } | null }>(`select gas_diff from gas_optimizations where id=$1`, [opt.id])).rows[0]?.gas_diff;
  if (diff?.status === "compile-failed") { await reply(`${MARKER}-autofix\n@${job.requestedBy} the patch for **${opt.title}** no longer compiles against this PR head — not opening a fix PR.`); return; }

  const filePath = state.source_path!;
  const current = await repoFile(token, job.owner, job.repo, filePath, state.head_sha ?? state.head_ref ?? "HEAD");
  if (!current || current.split(opt.patch.oldText).length - 1 !== 1) {
    await reply(`${MARKER}-autofix\n@${job.requestedBy} the file changed since the gas report; the patch no longer applies exactly once. Push a commit to refresh, then retry.`);
    return;
  }
  const patched = current.replace(opt.patch.oldText, opt.patch.newText);

  // Own branch + own PR; never the user's branch.
  const branch = `archon/fix-${opt.id.slice(0, 8)}`;
  const baseSha = state.head_sha!;
  await gh(token, "POST", `${repoPath}/git/refs`, { ref: `refs/heads/${branch}`, sha: baseSha }).catch(async (e) => {
    if (!String(e).includes("already exists")) throw e;
  });
  const existing = await gh<{ sha: string }>(token, "GET", `${repoPath}/contents/${encodeURIComponent(filePath)}?ref=${branch}`);
  await gh(token, "PUT", `${repoPath}/contents/${encodeURIComponent(filePath)}`, {
    message: `gas: ${opt.title} (Archon autofix, rule ${opt.rule_id})`,
    content: Buffer.from(patched).toString("base64"),
    sha: existing.sha,
    branch,
  });
  const pr = await gh<{ html_url: string; number: number }>(token, "POST", `${repoPath}/pulls`, {
    title: `Archon autofix: ${opt.title}`,
    head: branch,
    base: state.head_ref,
    body: `Applies the catalog-safe optimization **${opt.title}** (\`${opt.rule_id}\`) flagged on #${job.prNumber}.\n\n- Patch compile-validated by Archon's apply pipeline (gas evidence labeled \`${diff?.label ?? "estimate"}\`).\n- Evidence: ${BASE_URL}/app/gas/${state.gas_report_id}\n\nRequested by @${job.requestedBy} via \`/archon fix\`. Archon only opens its own branches — review and merge at your discretion.`,
  });
  await reply(`${MARKER}-autofix\n@${job.requestedBy} opened ${pr.html_url} with the compile-validated patch.`);
}
