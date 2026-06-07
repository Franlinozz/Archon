import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { DegradedNotice } from "@/components/archon";
import { GasOptimizationDetail } from "./opt-client";

export default async function Page({ params }: { params: Promise<{ reportId: string; optId: string }> }) {
  const { reportId, optId } = await params;
  let data;
  let degraded = false;
  try {
    data = (await db.query(
      `select go.id, go.gas_report_id as "gasReportId", go.rule_id as "ruleId", go.title, go.category, go.file, go.line_start as "lineStart", go.location, go.before, go.after, go.safety, go.confidence, go.status, go.measurement_label as "measurementLabel", go.est_l2_delta as "estL2Delta", go.measured_l2_delta as "measuredL2Delta", go.est_l1_delta_wei as "estL1DeltaWei", go.measured_l1_delta_wei as "measuredL1DeltaWei", go.annual_savings_usd as "annualSavingsUsd", go.patch, go.gas_diff as "gasDiff", go.notes,
              gr.contract_name as "contractName", gr.source_hash as "sourceHash", gr.totals, gr.assumptions
       from gas_optimizations go join gas_reports gr on gr.id=go.gas_report_id where go.gas_report_id=$1 and go.id=$2`,
      [reportId, optId],
    )).rows[0];
  } catch (error) {
    degraded = true;
    logger.error({ err: error instanceof Error ? error.message : String(error), reportId, optId }, "gas optimization detail fetch failed");
  }
  if (degraded) return <div className="space-y-6"><DegradedNotice resource="This gas optimization" /></div>;
  if (!data) notFound();
  return <GasOptimizationDetail optimization={data} />;
}
