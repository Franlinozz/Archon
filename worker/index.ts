import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import { Worker } from "bullmq";
import { closeDb } from "../lib/db/client";
import { redisConnection } from "../lib/queue/redis";
import { runScan } from "../lib/scan/runner";
import { runApplyPatch, runGasReport } from "../lib/gas/service";
import { runSentinelCycle } from "../lib/sentinel/service";
import { ensureSentinelRepeatable, type SentinelJobPayload } from "../lib/queue/sentinel";
import { runObservatoryCycle } from "../lib/observatory/sampler";
import { ensureObservatoryRepeatable, type ObservatoryJobPayload } from "../lib/queue/observatory";
import { runAttestation } from "../lib/attest/service";
import type { AttestJobPayload } from "../lib/queue/attest";
import { handleGithubJob, type GithubJob } from "../lib/github/service";
import type { GasJobPayload } from "../lib/queue/gas";
import type { ScanJobPayload } from "../lib/queue/scans";

const WORKER_LOCK_DURATION_MS = Number(process.env.ARCHON_WORKER_LOCK_DURATION_MS ?? 900_000);

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
    lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: 30_000,
    maxStalledCount: 1,
  },
);

const gasWorker = new Worker<GasJobPayload>(
  "archon-gas",
  async (job) => {
    if (job.data.kind === "scan") {
      console.log(`received gas scan ${job.data.gasReportId}`);
      await runGasReport(job.data.gasReportId);
      return;
    }
    console.log(`received gas apply ${job.data.gasReportId}/${job.data.optimizationId}`);
    await runApplyPatch(job.data.gasReportId, job.data.optimizationId);
  },
  {
    ...redisConnection,
    concurrency: 1,
    lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: 30_000,
    maxStalledCount: 1,
  },
);

// GitHub App jobs: PR checks + autofix, rate-limited per queue (GitHub
// secondary limits are also respected inside the REST helper).
const githubWorker = new Worker<GithubJob>(
  "archon-github",
  async (job) => { await handleGithubJob(job.data); },
  { ...redisConnection, concurrency: 1, lockDuration: 600_000, stalledInterval: 30_000, maxStalledCount: 1, limiter: { max: 20, duration: 60_000 } },
);
githubWorker.on("error", (error) => console.error("github worker error (recovering):", error instanceof Error ? error.message : error));
githubWorker.on("failed", (job, error) => console.error(`github job ${job?.id ?? "unknown"} failed`, error));

// Verified build attestations: deterministic compile-and-compare jobs.
const attestWorker = new Worker<AttestJobPayload>(
  "archon-attest",
  async (job) => { await runAttestation(job.data.attestationId); },
  { ...redisConnection, concurrency: 1, lockDuration: 300_000, stalledInterval: 30_000, maxStalledCount: 1 },
);
attestWorker.on("error", (error) => console.error("attest worker error (recovering):", error instanceof Error ? error.message : error));
attestWorker.on("failed", (job, error) => console.error(`attest job ${job?.id ?? "unknown"} failed`, error));

// Sentinel: one repeatable cycle (drift detection over watched addresses).
const sentinelWorker = new Worker<SentinelJobPayload>(
  "archon-sentinel",
  async () => { await runSentinelCycle(); },
  { ...redisConnection, concurrency: 1, lockDuration: 300_000, stalledInterval: 30_000, maxStalledCount: 1 },
);
ensureSentinelRepeatable().then(() => console.log("sentinel repeatable scheduled")).catch((error) => console.error("sentinel scheduler error:", error instanceof Error ? error.message : error));

// Gas Observatory: repeatable receipt sampler (also recalibrates the DA model).
const observatoryWorker = new Worker<ObservatoryJobPayload>(
  "archon-observatory",
  async () => { await runObservatoryCycle(); },
  { ...redisConnection, concurrency: 1, lockDuration: 300_000, stalledInterval: 30_000, maxStalledCount: 1 },
);
observatoryWorker.on("error", (error) => console.error("observatory worker error (recovering):", error instanceof Error ? error.message : error));
observatoryWorker.on("failed", (job, error) => console.error(`observatory job ${job?.id ?? "unknown"} failed`, error));
ensureObservatoryRepeatable().then(() => console.log("observatory repeatable scheduled")).catch((error) => console.error("observatory scheduler error:", error instanceof Error ? error.message : error));

worker.on("completed", (job) => console.log(`scan job ${job.id} completed`));
worker.on("failed", (job, error) => console.error(`scan job ${job?.id ?? "unknown"} failed`, error));
gasWorker.on("completed", (job) => console.log(`gas job ${job.id} completed`));
gasWorker.on("failed", (job, error) => console.error(`gas job ${job?.id ?? "unknown"} failed`, error));

// Worker-level connection errors (Redis drop, etc.) must be handled, otherwise BullMQ's
// EventEmitter throws on an unhandled 'error' and the process exits. ioredis reconnects
// underneath via retryStrategy; here we just log and keep the worker alive.
worker.on("error", (error) => console.error("worker error (recovering):", error instanceof Error ? error.message : error));
gasWorker.on("error", (error) => console.error("gas worker error (recovering):", error instanceof Error ? error.message : error));
sentinelWorker.on("error", (error) => console.error("sentinel worker error (recovering):", error instanceof Error ? error.message : error));
sentinelWorker.on("failed", (job, error) => console.error(`sentinel job ${job?.id ?? "unknown"} failed`, error));

// Last-resort guards so a stray async error never silently kills the worker. Connection
// blips recover on their own; we log and stay up rather than exiting non-zero.
process.on("unhandledRejection", (reason) => console.error("worker unhandledRejection (recovering):", reason instanceof Error ? reason.message : reason));
process.on("uncaughtException", (error) => console.error("worker uncaughtException (recovering):", error instanceof Error ? error.message : error));

async function shutdown() {
  await worker.close();
  await gasWorker.close();
  await sentinelWorker.close();
  await observatoryWorker.close();
  await attestWorker.close();
  await githubWorker.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
console.log(`archon-worker ready · stageTimeout=${process.env.ARCHON_STAGE_TIMEOUT_MS ?? "default-min-600000"}ms · lockDuration=${WORKER_LOCK_DURATION_MS}ms`);
