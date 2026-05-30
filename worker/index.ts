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

// Worker-level connection errors (Redis drop, etc.) must be handled, otherwise BullMQ's
// EventEmitter throws on an unhandled 'error' and the process exits. ioredis reconnects
// underneath via retryStrategy; here we just log and keep the worker alive.
worker.on("error", (error) => console.error("worker error (recovering):", error instanceof Error ? error.message : error));

// Last-resort guards so a stray async error never silently kills the worker. Connection
// blips recover on their own; we log and stay up rather than exiting non-zero.
process.on("unhandledRejection", (reason) => console.error("worker unhandledRejection (recovering):", reason instanceof Error ? reason.message : reason));
process.on("uncaughtException", (error) => console.error("worker uncaughtException (recovering):", error instanceof Error ? error.message : error));

async function shutdown() {
  await worker.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
console.log("archon-worker ready");
