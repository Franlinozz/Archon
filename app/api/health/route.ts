import { NextResponse } from "next/server";
import { pingDb } from "@/lib/db/client";
import { pingRedis } from "@/lib/queue/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  // Use the actual boolean each probe returns. (The previous `.then(() => true)` mapped any
  // resolved value to true, so a probe that *returns* false — like the fail-fast Redis ping —
  // was reported as healthy; only a thrown error flipped it.) Both probes are time-bounded.
  const [db, redis] = await Promise.all([
    pingDb().catch(() => false),
    pingRedis().catch(() => false),
  ]);
  const ok = db && redis;
  return NextResponse.json({ ok, db, redis, version: process.env.APP_VERSION ?? "2.0.0" }, { status: ok ? 200 : 503 });
}
