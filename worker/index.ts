import "dotenv/config";
import { Worker } from "bullmq";
import { closeDb, db } from "../lib/db/client";
import { redisConnection } from "../lib/queue/redis";
import type { ScanJobPayload } from "../lib/queue/scans";

const worker = new Worker<ScanJobPayload>("archon-scans", async (job) => {
  const { scanId } = job.data;
  console.log(`received scan ${scanId}`);
  await db.query("update scans set status = 'running', started_at = now(), progress = 50, current_stage = 'Worker Skeleton' where id = $1", [scanId]);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await db.query("update scans set status = 'done', finished_at = now(), progress = 100, current_stage = 'Done' where id = $1", [scanId]);
}, { ...redisConnection, concurrency: 2 });

worker.on("failed", (job, error) => console.error(`scan job ${job?.id ?? "unknown"} failed`, error));
process.on("SIGTERM", async () => { await worker.close(); await closeDb(); process.exit(0); });
console.log("archon-worker ready");
