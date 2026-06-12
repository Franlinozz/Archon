import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type AttestJobPayload = { attestationId: string };
export const attestQueue = new Queue<AttestJobPayload>("archon-attest", redisConnection);
export async function enqueueAttestation(attestationId: string) {
  return attestQueue.add("attest", { attestationId }, { attempts: 2, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 50, removeOnFail: 50 });
}
