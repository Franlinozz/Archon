import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type ObservatoryJobPayload = { tick: true };
export const observatoryQueue = new Queue<ObservatoryJobPayload>("archon-observatory", redisConnection);

const CYCLE_MS = Number(process.env.OBSERVATORY_CYCLE_MS ?? 30 * 60_000); // 30 min

export async function ensureObservatoryRepeatable() {
  const schedulers = await observatoryQueue.getJobSchedulers();
  for (const s of schedulers) {
    if (s.key && Number(s.every) !== CYCLE_MS) await observatoryQueue.removeJobScheduler(s.key);
  }
  await observatoryQueue.upsertJobScheduler("observatory-cycle", { every: CYCLE_MS }, { name: "observatory", data: { tick: true }, opts: { removeOnComplete: 20, removeOnFail: 20 } });
}
