import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { DegradedNotice } from "@/components/archon";
import { CostGuardClient, type CostGuardSnapshot } from "./cost-guard-client";

export default async function Page() {
  let snapshot: CostGuardSnapshot | null = null;
  let degraded = false;

  try {
    const [summaryResult, recentResult, topResult] = await Promise.all([
      db.query(
        `select
           count(*)::int as "totalReports",
           count(*) filter (where status = 'done')::int as "doneReports",
           count(*) filter (where status in ('queued','running'))::int as "activeReports",
           count(*) filter (where status = 'failed')::int as "failedReports",
           coalesce(sum(coalesce((totals->>'annualSavingsUsd')::numeric, 0)) filter (where status = 'done'), 0)::text as "annualSavingsUsd",
           coalesce(sum(coalesce((totals->>'l2GasSavedPerCall')::numeric, 0)) filter (where status = 'done'), 0)::text as "l2GasSavedPerCall",
           coalesce(sum(coalesce((totals->'split'->>'l1DaWeiPerCall')::numeric, coalesce((totals->>'l1DaWeiSavedPerCall')::numeric, 0))) filter (where status = 'done'), 0)::text as "l1DaWeiSavedPerCall",
           max(finished_at) filter (where status = 'done') as "lastFinishedAt"
         from gas_reports`,
      ),
      db.query(
        `select id, contract_name as "contractName", source_kind as "sourceKind", source_ref as "sourceRef", status, progress, current_stage as "currentStage", totals, assumptions, report_hash as "reportHash", anchor_tx_hash as "anchorTxHash", created_at as "createdAt", finished_at as "finishedAt", error
         from gas_reports
         order by created_at desc
         limit 8`,
      ),
      db.query(
        `select go.id, go.gas_report_id as "gasReportId", gr.contract_name as "contractName", go.title, go.category, go.location, go.safety, go.measurement_label as "measurementLabel", go.measured_l2_delta as "measuredL2Delta", go.est_l2_delta as "estL2Delta", go.measured_l1_delta_wei as "measuredL1DeltaWei", go.est_l1_delta_wei as "estL1DeltaWei", go.annual_savings_usd::text as "annualSavingsUsd", go.rank_score::text as "rankScore"
         from gas_optimizations go
         join gas_reports gr on gr.id = go.gas_report_id
         where gr.status = 'done'
         order by go.rank_score desc nulls last, go.annual_savings_usd desc nulls last, go.created_at asc
         limit 6`,
      ),
    ]);

    snapshot = {
      summary: summaryResult.rows[0] ?? {},
      recentReports: recentResult.rows,
      topOptimizations: topResult.rows,
    } as CostGuardSnapshot;
  } catch (error) {
    degraded = true;
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "cost guard dashboard fetch failed");
  }

  if (degraded || !snapshot) return <div className="space-y-6"><DegradedNotice resource="Cost Guard dashboard" /></div>;
  return <CostGuardClient snapshot={snapshot} />;
}
