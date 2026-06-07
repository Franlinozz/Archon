import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

const paramsSchema = z.object({ id: z.string().uuid(), optId: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ id: string; optId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid gas report/optimization id." }, { status: 400 });
  const opt = (await db.query(
    `select go.id, go.gas_report_id as "gasReportId", go.rule_id as "ruleId", go.title, go.category, go.file, go.line_start as "lineStart", go.location, go.before, go.after, go.safety, go.confidence, go.status, go.measurement_label as "measurementLabel", go.est_l2_delta as "estL2Delta", go.measured_l2_delta as "measuredL2Delta", go.est_l1_delta_wei as "estL1DeltaWei", go.measured_l1_delta_wei as "measuredL1DeltaWei", go.annual_savings_usd as "annualSavingsUsd", go.rank_score as "rankScore", go.patch, go.gas_diff as "gasDiff", go.notes,
            gr.source_hash as "sourceHash", gr.contract_name as "contractName", gr.assumptions
     from gas_optimizations go join gas_reports gr on gr.id=go.gas_report_id where go.gas_report_id=$1 and go.id=$2`,
    [params.data.id, params.data.optId],
  )).rows[0];
  if (!opt) return NextResponse.json({ error: "Gas optimization not found." }, { status: 404 });
  return NextResponse.json({ schema: "archon.gas.optimization.v1", optimization: opt });
}
