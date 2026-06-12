import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type SentinelJobPayload = { kind: "cycle" };
export const sentinelQueue = new Queue<SentinelJobPayload>("archon-sentinel", redisConnection);

const CYCLE_MS = Number(process.env.SENTINEL_CYCLE_MS ?? 600_000); // 10 min

/** Idempotently registers the repeatable Sentinel cycle (called at worker boot). */
export async function ensureSentinelRepeatable() {
  // Drop stale schedules if the interval changed, then upsert the current one.
  const schedulers = await sentinelQueue.getJobSchedulers();
  for (const s of schedulers) {
    if (s.key && Number(s.every) !== CYCLE_MS) await sentinelQueue.removeJobScheduler(s.key);
  }
  await sentinelQueue.upsertJobScheduler("sentinel-cycle", { every: CYCLE_MS }, { name: "cycle", data: { kind: "cycle" }, opts: { removeOnComplete: 20, removeOnFail: 20 } });
}
