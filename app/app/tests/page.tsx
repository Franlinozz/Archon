import Link from "next/link";
import { ArrowUpRight, FlaskConical } from "lucide-react";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { DegradedNotice } from "@/components/archon";

type TestReportRow = { id: string; contractName: string; riskScore: number; createdAt: string; tests: { files?: Array<{ path?: string; tests?: unknown[] }>; coverage?: unknown[] } | null };

export const dynamic = "force-dynamic";

export default async function TestsIndexPage() {
  let rows: Array<TestReportRow & { fileCount: number; testCount: number; coverageCount: number }> = [];
  let degraded = false;
  try {
    const result = await db.query<TestReportRow>(`select id, contract_name as "contractName", risk_score as "riskScore", created_at as "createdAt", tests from reports order by created_at desc limit 100`);
    rows = result.rows.map((row) => ({
      ...row,
      fileCount: row.tests?.files?.length ?? 0,
      testCount: row.tests?.files?.reduce((total, file) => total + (Array.isArray(file.tests) ? file.tests.length : 0), 0) ?? 0,
      coverageCount: row.tests?.coverage?.length ?? 0,
    }));
  } catch (error) {
    degraded = true;
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "tests page data fetch failed; rendering degraded state");
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.14em] text-green-400">Generated Tests</p><h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Foundry regression test index</h1><p className="mt-2 max-w-3xl text-text-mid">Every completed report can include generated Foundry tests mapped back to findings and coverage rows.</p></div><Link href="/app/audit/new" className="rounded-control bg-green-400 px-4 py-2 text-sm font-semibold text-canvas">Run new audit</Link></header>
    {degraded ? <DegradedNotice resource="Generated tests data"/> : null}
    <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><div className="overflow-hidden rounded-card border border-border-subtle"><table className="w-full text-left text-sm"><thead className="bg-surface-2 text-text-low"><tr><th className="p-3">Contract</th><th className="p-3">Files</th><th className="p-3">Tests</th><th className="p-3">Coverage rows</th><th className="p-3">Risk</th><th className="p-3">Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-border-subtle hover:bg-surface-2"><td className="p-3 text-text-hi">{row.contractName}</td><td className="p-3 text-text-mid">{row.fileCount}</td><td className="p-3 text-green-400">{row.testCount}</td><td className="p-3 text-text-mid">{row.coverageCount}</td><td className="p-3 text-warning">{row.riskScore}</td><td className="p-3"><Link href={`/app/reports/${row.id}/tests`} className="inline-flex items-center gap-1 text-green-400">Open tests <ArrowUpRight size={14}/></Link></td></tr>)}{!rows.length ? <tr><td colSpan={6} className="p-8 text-center text-text-low"><FlaskConical className="mx-auto mb-2 text-green-400"/>Generated tests appear after the first completed scan.</td></tr> : null}</tbody></table></div></section>
  </div>;
}
