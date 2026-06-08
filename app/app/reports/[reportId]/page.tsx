import type { ComponentProps } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { DegradedNotice } from "@/components/archon";
import { ReportClient } from "./report-client";

type ReportClientProps = ComponentProps<typeof ReportClient>;

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  // notFound() throws a special Next error, so it must stay OUTSIDE the try/catch — otherwise
  // a genuine 404 would be swallowed and shown as a degraded state.
  let report: ReportClientProps["report"] | undefined;
  let findings: ReportClientProps["findings"] = [];
  let challenges: ReportClientProps["challenges"] = [];
  let degraded = false;
  try {
    const reportResult = await db.query(
      `select r.id, r.scan_id as "scanId", r.contract_name as "contractName", r.risk_score as "riskScore", r.severity_counts as "severityCounts", r.scope, r.executive_summary as "executiveSummary", r.report_hash as "reportHash", r.created_at as "createdAt",
              s.network, s.scan_depth as "scanDepth", s.started_at as "startedAt", s.finished_at as "finishedAt"
       from reports r join scans s on s.id = r.scan_id where r.id = $1`,
      [reportId],
    );
    report = reportResult.rows[0];
    if (report) {
      const [findingsResult, challengesResult] = await Promise.all([
        db.query(
          `select id, severity, category, title, file, line_start as "lineStart", line_end as "lineEnd", summary, why_mantle as "whyMantle", recommended_fix as "recommendedFix", gas_impact as "gasImpact", status
           from findings where report_id = $1 order by sort_index nulls last, id`,
          [reportId],
        ),
        db.query(`select id, target_type as "targetType", challenger, title, rationale, evidence_url as "evidenceUrl", status, challenge_hash as "challengeHash", reference_tx_hash as "referenceTxHash", reference_report_hash as "referenceReportHash", created_at as "createdAt" from report_challenges where report_id=$1 order by created_at desc`, [reportId]),
      ]);
      findings = findingsResult.rows;
      challenges = challengesResult.rows;
    }
  } catch (error) {
    degraded = true;
    logger.error({ err: error instanceof Error ? error.message : String(error), reportId }, "report detail data fetch failed; rendering degraded state");
  }
  if (degraded) return <div className="space-y-6"><DegradedNotice resource="This report"/></div>;
  if (!report) notFound();
  return <ReportClient report={report} findings={findings} challenges={challenges} />;
}
