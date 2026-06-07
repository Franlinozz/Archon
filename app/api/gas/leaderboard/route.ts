import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export async function GET() {
  const rows = (await db.query(
    `select gr.id as "gasReportId", gr.contract_name as "contractName", gr.source_hash as "sourceHash", gr.report_hash as "reportHash", gr.anchor_tx_hash as "anchorTxHash", gr.totals, gr.assumptions, gr.created_at as "createdAt",
            count(go.id)::int as "optimizationCount",
            coalesce(sum(coalesce(go.annual_savings_usd,0)),0)::numeric as "annualSavingsUsd"
     from gas_reports gr left join gas_optimizations go on go.gas_report_id=gr.id
     where gr.status='done'
     group by gr.id
     order by coalesce((gr.totals->>'annualSavingsUsd')::numeric, sum(coalesce(go.annual_savings_usd,0))) desc nulls last, gr.created_at desc
     limit 50`,
  )).rows;
  return NextResponse.json({ schema: "archon.gas.leaderboard.v1", assumption: "Annual savings use each report's stored callsPerYear and MNT/USD assumptions; compare only after normalizing traffic assumptions.", rows });
}
