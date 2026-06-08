import { z } from "zod";
import { db } from "@/lib/db/client";
import { canonicalize, sha256Hex } from "@/lib/proof/canonical";

export const challengeInputSchema = z.object({
  targetType: z.enum(["report", "finding", "gas-report", "optimization"]),
  findingId: z.string().uuid().optional(),
  optimizationId: z.string().uuid().optional(),
  challenger: z.string().trim().max(120).optional(),
  title: z.string().trim().min(6).max(160),
  rationale: z.string().trim().min(20).max(4000),
  evidenceUrl: z.string().url().max(500).optional().or(z.literal("")),
});

export type ChallengeInput = z.infer<typeof challengeInputSchema>;

export async function listReportChallenges(reportId: string) {
  return (await db.query(
    `select id, report_id as "reportId", finding_id as "findingId", target_type as "targetType", challenger, title, rationale, evidence_url as "evidenceUrl", status, challenge_hash as "challengeHash", reference_tx_hash as "referenceTxHash", reference_report_hash as "referenceReportHash", created_at as "createdAt"
     from report_challenges where report_id=$1 order by created_at desc`,
    [reportId],
  )).rows;
}

export async function listGasChallenges(gasReportId: string) {
  return (await db.query(
    `select id, gas_report_id as "gasReportId", optimization_id as "optimizationId", target_type as "targetType", challenger, title, rationale, evidence_url as "evidenceUrl", status, challenge_hash as "challengeHash", reference_tx_hash as "referenceTxHash", reference_report_hash as "referenceReportHash", created_at as "createdAt"
     from report_challenges where gas_report_id=$1 order by created_at desc`,
    [gasReportId],
  )).rows;
}

async function reportProofRef(reportId: string) {
  return (await db.query<{ reportHash: string | null; txHash: string | null }>(`select report_hash as "reportHash", tx_hash as "txHash" from proofs where report_id=$1 order by logged_at desc nulls last, created_at desc limit 1`, [reportId])).rows[0] ?? null;
}

async function gasProofRef(gasReportId: string) {
  return (await db.query<{ reportHash: string | null; txHash: string | null }>(`select report_hash as "reportHash", anchor_tx_hash as "txHash" from gas_reports where id=$1`, [gasReportId])).rows[0] ?? null;
}

export async function createReportChallenge(reportId: string, input: ChallengeInput) {
  const proof = await reportProofRef(reportId);
  const payload = { schema: "archon.challenge.v1", reportId, ...input, evidenceUrl: input.evidenceUrl || null, referenceReportHash: proof?.reportHash ?? null, createdAt: new Date().toISOString() };
  const challengeHash = sha256Hex(canonicalize(payload));
  const row = (await db.query(
    `insert into report_challenges (report_id, finding_id, target_type, challenger, title, rationale, evidence_url, challenge_hash, reference_tx_hash, reference_report_hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning id, report_id as "reportId", finding_id as "findingId", target_type as "targetType", challenger, title, rationale, evidence_url as "evidenceUrl", status, challenge_hash as "challengeHash", reference_tx_hash as "referenceTxHash", reference_report_hash as "referenceReportHash", created_at as "createdAt"`,
    [reportId, input.findingId ?? null, input.targetType, input.challenger || null, input.title, input.rationale, input.evidenceUrl || null, challengeHash, proof?.txHash ?? null, proof?.reportHash ?? null],
  )).rows[0];
  return row;
}

export async function createGasChallenge(gasReportId: string, input: ChallengeInput) {
  const proof = await gasProofRef(gasReportId);
  const payload = { schema: "archon.challenge.v1", gasReportId, ...input, evidenceUrl: input.evidenceUrl || null, referenceReportHash: proof?.reportHash ?? null, createdAt: new Date().toISOString() };
  const challengeHash = sha256Hex(canonicalize(payload));
  const row = (await db.query(
    `insert into report_challenges (gas_report_id, optimization_id, target_type, challenger, title, rationale, evidence_url, challenge_hash, reference_tx_hash, reference_report_hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning id, gas_report_id as "gasReportId", optimization_id as "optimizationId", target_type as "targetType", challenger, title, rationale, evidence_url as "evidenceUrl", status, challenge_hash as "challengeHash", reference_tx_hash as "referenceTxHash", reference_report_hash as "referenceReportHash", created_at as "createdAt"`,
    [gasReportId, input.optimizationId ?? null, input.targetType, input.challenger || null, input.title, input.rationale, input.evidenceUrl || null, challengeHash, proof?.txHash ?? null, proof?.reportHash ?? null],
  )).rows[0];
  return row;
}
