import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { ReportClient } from "./report-client";

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const reportResult = await db.query(
    `select r.id, r.scan_id as "scanId", r.contract_name as "contractName", r.risk_score as "riskScore", r.severity_counts as "severityCounts", r.scope, r.executive_summary as "executiveSummary", r.report_hash as "reportHash", r.created_at as "createdAt",
            s.network, s.scan_depth as "scanDepth", s.started_at as "startedAt", s.finished_at as "finishedAt"
     from reports r join scans s on s.id = r.scan_id where r.id = $1`,
    [reportId],
  );
  const report = reportResult.rows[0];
  if (!report) notFound();
  const findingsResult = await db.query(
    `select id, severity, category, title, file, line_start as "lineStart", line_end as "lineEnd", summary, why_mantle as "whyMantle", recommended_fix as "recommendedFix", gas_impact as "gasImpact", status
     from findings where report_id = $1 order by sort_index nulls last, id`,
    [reportId],
  );
  return <ReportClient report={report} findings={findingsResult.rows} />;
}
