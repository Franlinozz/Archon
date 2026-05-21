import { NextResponse } from "next/server";
import { pingDb } from "@/lib/db/client";
import { pingRedis } from "@/lib/queue/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await pingDb().then(() => true).catch(() => false);
  const redis = await pingRedis().then(() => true).catch(() => false);
  const ok = db && redis;
  return NextResponse.json({ ok, db, redis, version: process.env.APP_VERSION ?? "2.0.0" }, { status: ok ? 200 : 503 });
}
