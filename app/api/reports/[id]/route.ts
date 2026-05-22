import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });

  const reportResult = await db.query(
    `select r.id, r.contract_name as "contractName", r.risk_score as "riskScore", r.severity_counts as "severityCounts", r.scope, r.executive_summary as "executiveSummary", r.report_hash as "reportHash", r.created_at as "createdAt",
            s.id as "scanId", s.network, s.scan_depth as "scanDepth", s.status as "scanStatus", s.started_at as "startedAt", s.finished_at as "finishedAt"
     from reports r join scans s on s.id = r.scan_id where r.id = $1`,
    [params.data.id],
  );
  const report = reportResult.rows[0];
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const findingsResult = await db.query(
    `select id, severity, category, title, file, line_start as "lineStart", line_end as "lineEnd", summary, why_mantle as "whyMantle", exploit_scenario as "exploitScenario", recommended_fix as "recommendedFix", confidence, gas_impact as "gasImpact", status
     from findings where report_id = $1 order by sort_index nulls last, id`,
    [params.data.id],
  );

  return NextResponse.json({
    schema: "archon.report.export.v1",
    report: {
      id: report.id,
      scanId: report.scanId,
      contractName: report.contractName,
      network: report.network,
      chainId: 5000,
      scanDepth: report.scanDepth,
      status: report.scanStatus,
      riskScore: report.riskScore,
      severityCounts: report.severityCounts,
      scope: report.scope,
      executiveSummary: report.executiveSummary,
      reportHash: report.reportHash,
      createdAt: report.createdAt,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
    },
    findings: findingsResult.rows.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
      file: finding.file,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      summary: finding.summary,
      whyMantle: finding.whyMantle,
      exploitScenario: finding.exploitScenario,
      recommendedFix: finding.recommendedFix,
      confidence: finding.confidence,
      gasImpact: finding.gasImpact,
      status: finding.status,
    })),
  });
}
