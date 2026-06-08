import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

export const runtime = "nodejs";

const querySchema = z.object({
  metric: z.enum(["score", "savings", "l2", "recent"]).default("score"),
  sourceKind: z.enum(["all", "sample", "paste", "address"]).default("all"),
  q: z.string().trim().max(120).optional().default(""),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const orderBy = {
  score: `"gasEfficiencyScore" desc nulls last, "annualSavingsUsd" desc nulls last, "createdAt" desc`,
  savings: `"annualSavingsUsd" desc nulls last, "gasEfficiencyScore" desc nulls last, "createdAt" desc`,
  l2: `"l2GasSavedPerCall" desc nulls last, "gasEfficiencyScore" desc nulls last, "createdAt" desc`,
  recent: `"createdAt" desc`,
} as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid leaderboard query.", issues: parsed.error.issues }, { status: 400 });
  const { metric, sourceKind, q, limit } = parsed.data;

  const conditions = ["gr.status='done'"];
  const values: unknown[] = [];
  if (sourceKind !== "all") {
    values.push(sourceKind);
    conditions.push(`gr.source_kind=$${values.length}`);
  }
  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    conditions.push(`(lower(coalesce(gr.contract_name,'')) like $${values.length} or lower(coalesce(gr.source_ref,'')) like $${values.length} or lower(coalesce(gr.source_hash,'')) like $${values.length})`);
  }
  values.push(limit);

  const rows = (await db.query(
    `with ranked as (
       select gr.id as "gasReportId",
              gr.contract_name as "contractName",
              gr.source_kind as "sourceKind",
              gr.source_ref as "sourceRef",
              gr.source_hash as "sourceHash",
              gr.report_hash as "reportHash",
              gr.anchor_tx_hash as "anchorTxHash",
              gr.totals,
              gr.assumptions,
              gr.created_at as "createdAt",
              count(go.id)::int as "optimizationCount",
              count(go.id) filter (where go.measurement_label='measured')::int as "measuredOptimizationCount",
              coalesce((gr.totals->>'annualSavingsUsd')::numeric, sum(coalesce(go.annual_savings_usd,0)), 0)::numeric as "annualSavingsUsd",
              coalesce((gr.totals->>'l2GasSavedPerCall')::numeric, sum(greatest(coalesce(go.measured_l2_delta, go.est_l2_delta, 0), 0)), 0)::numeric as "l2GasSavedPerCall",
              coalesce((gr.totals->>'l1DaWeiSavedPerCall')::numeric, sum(greatest(coalesce(go.measured_l1_delta_wei, go.est_l1_delta_wei, 0), 0)), 0)::numeric as "l1DaWeiSavedPerCall",
              (
                coalesce((gr.totals->>'annualSavingsUsd')::numeric, sum(coalesce(go.annual_savings_usd,0)), 0) * 100
                + coalesce((gr.totals->>'l2GasSavedPerCall')::numeric, sum(greatest(coalesce(go.measured_l2_delta, go.est_l2_delta, 0), 0)), 0)
                + least(count(go.id)::numeric, 10) * 25
                + case when gr.anchor_tx_hash is not null then 150 else 0 end
              )::numeric as "gasEfficiencyScore"
       from gas_reports gr
       left join gas_optimizations go on go.gas_report_id=gr.id
       where ${conditions.join(" and ")}
       group by gr.id
     )
     select * from ranked gr
     order by ${orderBy[metric]}
     limit $${values.length}`,
    values,
  )).rows;

  return NextResponse.json({
    schema: "archon.gas.leaderboard.v2",
    generatedAt: new Date().toISOString(),
    filters: { metric, sourceKind, q, limit },
    assumption: "Rows are completed gas reports from Archon's database. sourceKind='sample' means an Archon sample contract, not a third-party production deployment. Annual savings use each report's stored callsPerYear and MNT/USD assumptions; compare after normalizing traffic assumptions.",
    rows,
  });
}
