import { Queue } from "bullmq";
import { redisConnection } from "./redis";
export type ScanJobPayload = { scanId: string };
export const scanQueue = new Queue<ScanJobPayload>("archon-scans", redisConnection);
export async function enqueueScan(scanId: string) { return scanQueue.add("scan", { scanId }, { attempts: 2, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 50, removeOnFail: 50 }); }
