import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { deriveContractName } from "@/lib/source/names";

const paramsSchema = z.object({ id: z.string().uuid() });

function fallbackContractName(scan: { sourceKind?: string; sourceRef?: string | null; source_code?: string | null }) {
  const label = scan.sourceKind === "paste" ? scan.sourceRef?.trim() : null;
  return deriveContractName(scan.source_code ?? "", { label });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid scan id." }, { status: 400 });

  const scanResult = await db.query(
    `select id, source_kind as "sourceKind", source_ref as "sourceRef", source_code, network, scan_depth as "scanDepth", protocols, status, progress, current_stage as "currentStage", created_at as "createdAt", started_at as "startedAt", finished_at as "finishedAt", error
     from scans where id = $1`,
    [params.data.id],
  );

  const scan = scanResult.rows[0];
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  const scanPayload = { ...scan, contractName: fallbackContractName(scan), source_code: undefined };

  const [findingsResult, logsResult, reportResult] = await Promise.all([
    db.query(
      `select id, severity, category, title, file, line_start as "lineStart", line_end as "lineEnd", summary, status, sort_index as "sortIndex", created_at as "createdAt"
       from findings where scan_id = $1 order by sort_index nulls last, id`,
      [params.data.id],
    ),
    db.query(
      `select id, level, message, created_at as "createdAt" from scan_logs where scan_id = $1 order by created_at asc, id asc limit 300`,
      [params.data.id],
    ),
    db.query(
      `select id, contract_name as "contractName", risk_score as "riskScore", severity_counts as "severityCounts", report_hash as "reportHash", created_at as "createdAt"
       from reports where scan_id = $1 order by created_at desc limit 1`,
      [params.data.id],
    ),
  ]);

  return NextResponse.json({ scan: scanPayload, findings: findingsResult.rows, logs: logsResult.rows, report: reportResult.rows[0] ?? null });
}
