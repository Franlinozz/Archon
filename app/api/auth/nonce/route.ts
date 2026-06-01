import { NextResponse } from "next/server";
import { redis, redisReady } from "@/lib/queue/redis";
import { newNonce } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Issue a one-time nonce for SIWE. Stored in Redis with a short TTL so each
// sign-in attempt uses a fresh nonce (prevents replay).
export async function GET() {
  const nonce = newNonce();
  try {
    if (redisReady()) await redis.set(`siwe:nonce:${nonce}`, "1", "EX", 300);
  } catch {
    /* if redis is briefly down, verify will reject the unstored nonce */
  }
  return NextResponse.json({ nonce });
}
