import type { ComponentProps } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { DegradedNotice } from "@/components/archon";
import { buildGeneratedTests } from "@/lib/tests/generation";
import { TestsClient } from "./tests-client";

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  let report: { id: string; contractName: string; tests: never } | undefined;
  let tests: ComponentProps<typeof TestsClient>["tests"] | undefined;
  let degraded = false;
  try {
    const reportResult = await db.query<{ id: string; contractName: string; tests: never }>(
      `select id, contract_name as "contractName", tests from reports where id = $1`,
      [reportId],
    );
    report = reportResult.rows[0];
    if (report) {
      tests = report.tests;
      if (!tests) {
        const findings = await db.query(
          `select id, severity, category, title, file, line_start, line_end, summary from findings where report_id = $1 order by sort_index nulls last, id`,
          [reportId],
        );
        tests = buildGeneratedTests(report.contractName, findings.rows) as never;
        await db.query("update reports set tests = $2::jsonb where id = $1", [reportId, JSON.stringify(tests)]);
      }
    }
  } catch (error) {
    degraded = true;
    logger.error({ err: error instanceof Error ? error.message : String(error), reportId }, "report tests data fetch failed; rendering degraded state");
  }
  if (degraded) return <div className="space-y-6"><DegradedNotice resource="Generated tests"/></div>;
  if (!report) notFound();
  return <TestsClient reportId={reportId} tests={tests!} />;
}
