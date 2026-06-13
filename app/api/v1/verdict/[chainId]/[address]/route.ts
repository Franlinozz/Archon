import { NextResponse } from "next/server";
import { buildVerdict, signVerdict } from "@/lib/agent/verdict";

export const dynamic = "force-dynamic";

// Signed verdict endpoint (F6). Cached by address+day in-process so repeated
// agent calls don't re-query/re-sign; light per-IP rate limit to protect the
// free tier. Public — the "can my agent trust this contract?" primitive.
type Cached = { at: number; body: unknown };
const verdictCache = new Map<string, Cached>();
const DAY_MS = 86_400_000;
const ipHits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = Number(process.env.VERDICT_RATE_LIMIT_PER_MIN ?? 60);

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = ipHits.get(ip);
  if (!cur || now > cur.resetAt) { ipHits.set(ip, { count: 1, resetAt: now + 60_000 }); return false; }
  cur.count += 1;
  return cur.count > RATE_LIMIT;
}

export async function GET(request: Request, context: { params: Promise<{ chainId: string; address: string }> }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (rateLimited(ip)) return NextResponse.json({ error: "Rate limit exceeded. Use an API key for higher limits." }, { status: 429 });

  const { chainId: chainIdRaw, address } = await context.params;
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId)) return NextResponse.json({ error: "Invalid chainId." }, { status: 400 });

  const key = `${chainId}:${address.toLowerCase()}:${new Date().toISOString().slice(0, 10)}`;
  const hit = verdictCache.get(key);
  if (hit && Date.now() - hit.at < DAY_MS) return NextResponse.json(hit.body, { headers: { "x-archon-cache": "hit" } });

  const verdict = await buildVerdict(chainId, address);
  if ("error" in verdict) return NextResponse.json(verdict, { status: 400 });
  const signed = await signVerdict(verdict);
  if (!signed) return NextResponse.json({ ...verdict, signature: null, note: "Signing key not configured on this deployment; verdict is unsigned." }, { status: 200 });

  verdictCache.set(key, { at: Date.now(), body: signed });
  return NextResponse.json(signed, { headers: { "x-archon-cache": "miss", "cache-control": "public, max-age=3600" } });
}
