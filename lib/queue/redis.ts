import IORedis from "ioredis";
import { logger } from "@/lib/logger";

const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

export const redis = new IORedis(url, {
  // Required by BullMQ for blocking commands.
  maxRetriesPerRequest: null,
  // Reconnect with capped backoff instead of giving up after a Redis restart/blip.
  retryStrategy: (times) => Math.min(times * 200, 5_000),
  // Re-issue commands after a reconnect rather than erroring them out.
  reconnectOnError: () => true,
});

// CRITICAL: without an 'error' listener, ioredis connection errors become unhandled
// 'error' events that crash the Node process — this is what killed archon-worker on a
// Redis blip (ECONNREFUSED -> ELIFECYCLE exit). With a listener, ioredis logs and
// transparently reconnects via retryStrategy instead of dying.
redis.on("error", (err) => logger.error({ err: err.message }, "redis connection error"));
redis.on("reconnecting", (ms: number) => logger.warn({ ms }, "redis reconnecting"));
redis.on("ready", () => logger.info("redis ready"));

export const redisConnection = { connection: redis };

// True only when the connection is live. Used to fail fast instead of letting commands
// sit in ioredis's offline queue (maxRetriesPerRequest:null buffers forever otherwise).
export function redisReady() {
  return redis.status === "ready";
}

// Genuine round-trip PING when connected, but bounded: returns false immediately if the
// socket isn't ready and caps a hung ping at 2s, so /api/health never blocks on a Redis
// outage (and we don't pile pings into the offline queue).
export async function pingRedis() {
  if (!redisReady()) return false;
  try {
    const pong = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("redis ping timeout")), 2_000)),
    ]);
    return pong === "PONG";
  } catch {
    return false;
  }
}
