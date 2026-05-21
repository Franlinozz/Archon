import { Queue } from "bullmq";
import { redisConnection } from "./redis";
export type ScanJobPayload = { scanId: string };
export const scanQueue = new Queue<ScanJobPayload>("archon-scans", redisConnection);
export async function enqueueScan(scanId: string) { return scanQueue.add("scan", { scanId }, { attempts: 1, removeOnComplete: 50, removeOnFail: 50 }); }
