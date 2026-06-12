import { Queue } from "bullmq";
import { redisConnection } from "./redis";
import type { GithubJob } from "@/lib/github/service";

export const githubQueue = new Queue<GithubJob>("archon-github", redisConnection);

/** PR jobs dedupe by head SHA (force-push never double-posts); autofix by optimization. */
export async function enqueueGithubJob(job: GithubJob) {
  const jobId = job.kind === "pr"
    ? `pr-${job.owner}-${job.repo}-${job.prNumber}-${job.headSha}`
    : `fix-${job.owner}-${job.repo}-${job.prNumber}-${job.optimizationId}`;
  return githubQueue.add(job.kind, job, { jobId, attempts: 2, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 100, removeOnFail: 100 });
}
