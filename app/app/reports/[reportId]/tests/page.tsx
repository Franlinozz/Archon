import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { buildGeneratedTests } from "@/lib/tests/generation";
import { TestsClient } from "./tests-client";

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const reportResult = await db.query<{ id: string; contractName: string; tests: never }>(
    `select id, contract_name as "contractName", tests from reports where id = $1`,
    [reportId],
  );
  const report = reportResult.rows[0];
  if (!report) notFound();
  let tests = report.tests;
  if (!tests) {
    const findings = await db.query(
      `select id, severity, category, title, file, line_start, line_end, summary from findings where report_id = $1 order by sort_index nulls last, id`,
      [reportId],
    );
    tests = buildGeneratedTests(report.contractName, findings.rows) as never;
    await db.query("update reports set tests = $2::jsonb where id = $1", [reportId, JSON.stringify(tests)]);
  }
  return <TestsClient reportId={reportId} tests={tests} />;
}
