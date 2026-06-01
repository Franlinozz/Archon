import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type FindingHit = { id: string; reportId: string; severity: string; title: string; file: string | null; lineStart: number | null; contractName: string };
type ReportHit = { id: string; contractName: string; riskScore: number; reportHash: string | null };
type ContractHit = { reportId: string; contractName: string; address: string | null };

// Global search across findings, reports, and contracts. Capped per group; degrades
// to empty groups (never errors) so the command palette always responds.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ findings: [], reports: [], contracts: [] });
  const like = `%${q}%`;

  try {
    const [findings, reports, contracts] = await Promise.all([
      db.query<FindingHit>(
        `select f.id, f.report_id as "reportId", f.severity, f.title, f.file, f.line_start as "lineStart", r.contract_name as "contractName"
           from findings f join reports r on r.id = f.report_id
          where f.report_id is not null and (f.title ilike $1 or f.file ilike $1 or f.category ilike $1)
          order by f.created_at desc limit 7`,
        [like],
      ),
      db.query<ReportHit>(
        `select id, contract_name as "contractName", risk_score as "riskScore", report_hash as "reportHash"
           from reports where contract_name ilike $1 order by created_at desc limit 7`,
        [like],
      ),
      db.query<ContractHit>(
        `select distinct on (r.contract_name) r.id as "reportId", r.contract_name as "contractName", s.source_ref as address
           from reports r join scans s on s.id = r.scan_id
          where r.contract_name ilike $1
          order by r.contract_name, r.created_at desc limit 7`,
        [like],
      ),
    ]);
    return NextResponse.json({ findings: findings.rows, reports: reports.rows, contracts: contracts.rows });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "search query failed");
    return NextResponse.json({ findings: [], reports: [], contracts: [], degraded: true });
  }
}
