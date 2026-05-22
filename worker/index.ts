import "dotenv/config";
import { Worker } from "bullmq";
import { closeDb } from "../lib/db/client";
import { redisConnection } from "../lib/queue/redis";
import { runScan } from "../lib/scan/runner";
import type { ScanJobPayload } from "../lib/queue/scans";

const worker = new Worker<ScanJobPayload>(
  "archon-scans",
  async (job) => {
    const { scanId } = job.data;
    console.log(`received scan ${scanId}`);
    try {
      await runScan(scanId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`scan ${scanId} failed: ${message}`);
      throw new Error(message);
    }
  },
  {
    ...redisConnection,
    concurrency: 2,
    lockDuration: 180_000,
    stalledInterval: 30_000,
    maxStalledCount: 1,
  },
);

worker.on("completed", (job) => console.log(`scan job ${job.id} completed`));
worker.on("failed", (job, error) => console.error(`scan job ${job?.id ?? "unknown"} failed`, error));

async function shutdown() {
  await worker.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
console.log("archon-worker ready");
