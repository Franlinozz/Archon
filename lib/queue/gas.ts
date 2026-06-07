import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type GasJobPayload =
  | { kind: "scan"; gasReportId: string }
  | { kind: "apply"; gasReportId: string; optimizationId: string };

export const gasQueue = new Queue<GasJobPayload>("archon-gas", redisConnection);

export async function enqueueGasScan(gasReportId: string) {
  return gasQueue.add("gas-scan", { kind: "scan", gasReportId }, { attempts: 2, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 100, removeOnFail: 100 });
}

export async function enqueueGasApply(gasReportId: string, optimizationId: string) {
  return gasQueue.add(`gas-apply:${gasReportId}:${optimizationId}`, { kind: "apply", gasReportId, optimizationId }, { jobId: `gas-apply:${gasReportId}:${optimizationId}`, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
}
