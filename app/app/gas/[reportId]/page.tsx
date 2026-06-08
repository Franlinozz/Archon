import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { DegradedNotice } from "@/components/archon";
import { GasReportClient } from "./report-client";

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  let report;
  let optimizations = [];
  let challenges = [];
  let degraded = false;
  try {
    report = (await db.query(
      `select id, source_kind as "sourceKind", source_ref as "sourceRef", source_hash as "sourceHash", contract_name as "contractName", network, status, progress, current_stage as "currentStage", pricing, measurement, totals, assumptions, report_hash as "reportHash", anchor_tx_hash as "anchorTxHash", created_at as "createdAt", started_at as "startedAt", finished_at as "finishedAt", error
       from gas_reports where id=$1`,
      [reportId],
    )).rows[0];
    if (report) {
      const [optsResult, challengesResult] = await Promise.all([
        db.query(
          `select id, rule_id as "ruleId", title, category, file, line_start as "lineStart", location, before, after, safety, confidence, status, measurement_label as "measurementLabel", est_l2_delta as "estL2Delta", measured_l2_delta as "measuredL2Delta", est_l1_delta_wei as "estL1DeltaWei", measured_l1_delta_wei as "measuredL1DeltaWei", annual_savings_usd as "annualSavingsUsd", rank_score as "rankScore", patch, gas_diff as "gasDiff", notes
           from gas_optimizations where gas_report_id=$1 order by rank_score desc nulls last, created_at asc`,
          [reportId],
        ),
        db.query(`select id, target_type as "targetType", challenger, title, rationale, evidence_url as "evidenceUrl", status, challenge_hash as "challengeHash", reference_tx_hash as "referenceTxHash", reference_report_hash as "referenceReportHash", created_at as "createdAt" from report_challenges where gas_report_id=$1 order by created_at desc`, [reportId]),
      ]);
      optimizations = optsResult.rows;
      challenges = challengesResult.rows;
    }
  } catch (error) {
    degraded = true;
    logger.error({ err: error instanceof Error ? error.message : String(error), reportId }, "gas report page fetch failed");
  }
  if (degraded) return <div className="space-y-6"><DegradedNotice resource="This gas report" /></div>;
  if (!report) notFound();
  return <GasReportClient report={report} optimizations={optimizations} challenges={challenges} />;
}
