import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid gas report id." }, { status: 400 });

  const report = (await db.query(
    `select id, source_kind as "sourceKind", source_ref as "sourceRef", source_hash as "sourceHash", contract_name as "contractName", network, status, progress, current_stage as "currentStage", pricing, measurement, totals, assumptions, report_hash as "reportHash", anchor_tx_hash as "anchorTxHash", created_at as "createdAt", started_at as "startedAt", finished_at as "finishedAt", error
     from gas_reports where id=$1`,
    [params.data.id],
  )).rows[0];
  if (!report) return NextResponse.json({ error: "Gas report not found." }, { status: 404 });

  const optimizations = (await db.query(
    `select id, rule_id as "ruleId", title, category, file, line_start as "lineStart", location, before, after, safety, confidence, status, measurement_label as "measurementLabel", est_l2_delta as "estL2Delta", measured_l2_delta as "measuredL2Delta", est_l1_delta_wei as "estL1DeltaWei", measured_l1_delta_wei as "measuredL1DeltaWei", annual_savings_usd as "annualSavingsUsd", rank_score as "rankScore", patch, gas_diff as "gasDiff", notes
     from gas_optimizations where gas_report_id=$1 order by rank_score desc nulls last, created_at asc`,
    [params.data.id],
  )).rows;

  return NextResponse.json({ schema: "archon.gas.report.v1", report, optimizations });
}
