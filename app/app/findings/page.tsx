import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Search } from "lucide-react";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { DegradedNotice, SeverityPill } from "@/components/archon";
import type { Severity } from "@/components/archon/severity";

type FindingRow = {
  id: string;
  reportId: string;
  scanId: string;
  contractName: string;
  severity: Severity;
  category: string;
  title: string;
  file: string;
  lineStart: number | null;
  lineEnd: number | null;
  confidence: string | number | null;
  status: string;
  createdAt: string;
  riskScore: number;
  occurrences: number;
};

type CountRow = { severity: Severity; count: string };

export const dynamic = "force-dynamic";

export default async function FindingsIndexPage({ searchParams }: { searchParams: Promise<{ severity?: string; q?: string }> }) {
  const params = await searchParams;
  const severity = ["critical", "high", "medium", "low", "info"].includes(params.severity ?? "") ? params.severity : "all";
  const q = params.q?.trim() ?? "";
  const where: string[] = [];
  const values: unknown[] = [];
  if (severity !== "all") {
    values.push(severity);
    where.push(`f.severity = $${values.length}`);
  }
  if (q) {
    values.push(`%${q}%`);
    where.push(`(f.title ilike $${values.length} or f.category ilike $${values.length} or f.file ilike $${values.length} or r.contract_name ilike $${values.length})`);
  }
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  let rows: FindingRow[] = [];
  let counts: Record<string, string> = {};
  let degraded = false;
  try {
    // Dedup identical findings (same title/file/severity/category) to their most recent
    // occurrence so the same contract scanned repeatedly doesn't spam the index; an
    // `occurrences` count surfaces how many reports share each finding. The severity KPI
    // cards count distinct findings the same way so the numbers stay consistent.
    const [findingsResult, countsResult] = await Promise.all([
      db.query<FindingRow>(
        `select * from (
           select distinct on (f.title, f.file, f.severity, f.category)
             f.id, f.report_id as "reportId", f.scan_id as "scanId", r.contract_name as "contractName", f.severity, f.category, f.title, f.file, f.line_start as "lineStart", f.line_end as "lineEnd", f.confidence, f.status, f.created_at as "createdAt", r.risk_score as "riskScore",
             count(*) over (partition by f.title, f.file, f.severity, f.category)::int as occurrences
           from findings f join reports r on r.id=f.report_id
           ${whereSql}
           order by f.title, f.file, f.severity, f.category, f.created_at desc
         ) d
         order by case d.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 when 'low' then 4 else 5 end, d."createdAt" desc
         limit 100`,
        values,
      ),
      db.query<CountRow>(`select severity, count(*)::text as count from (select distinct title, file, severity, category from findings where report_id is not null) d group by severity`),
    ]);
    counts = Object.fromEntries(countsResult.rows.map((row) => [row.severity, row.count]));
    rows = findingsResult.rows;
  } catch (error) {
    degraded = true;
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "findings page data fetch failed; rendering degraded state");
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-green-400">Findings Index</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">All audit findings</h1>
        <p className="mt-2 max-w-3xl text-text-mid">Cross-report triage for deterministic Slither and Mantle-specific rule findings, deduplicated to unique issues. This is a review queue, not an auto-remediation surface.</p>
      </div>
      <Link href="/app/audit/new" className="rounded-control bg-green-400 px-4 py-2 text-sm font-semibold text-canvas">Run new audit</Link>
    </header>

    {degraded ? <DegradedNotice resource="Findings data"/> : null}

    <section className="grid gap-3 md:grid-cols-5">
      {(["critical", "high", "medium", "low", "info"] as Severity[]).map((item) => <Link key={item} href={`/app/findings?severity=${item}`} className="rounded-card border border-border-subtle bg-surface-1 p-4 hover:border-green-400/40"><p className="text-xs uppercase tracking-[0.12em] text-text-low">{item}</p><p className="mt-2 text-3xl font-bold text-text-hi">{degraded ? "—" : counts[item] ?? "0"}</p></Link>)}
    </section>

    <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
      <form className="flex flex-wrap gap-3" action="/app/findings">
        <label className="flex min-w-72 flex-1 items-center gap-2 rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-low"><Search size={15}/><input name="q" defaultValue={q} placeholder="Search contract, category, file, title…" className="w-full border-0 bg-transparent p-0 text-text-hi focus:ring-0" /></label>
        <select name="severity" defaultValue={severity} className="rounded-control border-border-subtle bg-surface-2 text-sm text-text-hi"><option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="info">Info</option></select>
        <button className="rounded-control border border-green-400/35 bg-green-400/10 px-4 py-2 text-sm text-green-400">Apply</button>
        <Link href="/app/findings" className="rounded-control border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-text-mid">Reset</Link>
      </form>
      <div className="mt-5 overflow-hidden rounded-card border border-border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-text-low"><tr><th className="p-3">Severity</th><th className="p-3">Finding</th><th className="p-3">Contract</th><th className="p-3">Location</th><th className="p-3">Confidence</th><th className="p-3">Action</th></tr></thead>
          <tbody>{rows.map((finding) => <tr key={finding.id} className="border-t border-border-subtle hover:bg-surface-2"><td className="p-3"><SeverityPill severity={finding.severity} size="sm"/></td><td className="p-3"><p className="font-semibold text-text-hi">{finding.title}{finding.occurrences > 1 ? <span className="ml-2 rounded-pill border border-border-subtle bg-surface-2 px-2 py-0.5 align-middle text-[10px] font-normal text-text-low">seen in {finding.occurrences} reports</span> : null}</p><p className="mt-1 font-mono text-xs text-text-low">{finding.category}</p></td><td className="p-3"><p className="text-text-hi">{finding.contractName}</p><p className="text-xs text-warning">risk {finding.riskScore}</p></td><td className="p-3 font-mono text-text-low">{finding.file}:{finding.lineStart ?? "?"}{finding.lineEnd && finding.lineEnd !== finding.lineStart ? `-${finding.lineEnd}` : ""}</td><td className="p-3 text-green-400">{Math.round(Number(finding.confidence ?? 0) * 100)}%</td><td className="p-3"><Link href={`/app/reports/${finding.reportId}/findings/${finding.id}`} className="inline-flex items-center gap-1 text-green-400">Open <ArrowUpRight size={14}/></Link></td></tr>)}{!rows.length ? <tr><td colSpan={6} className="p-8 text-center text-text-low"><AlertTriangle className="mx-auto mb-2 text-warning"/>No findings match this filter.</td></tr> : null}</tbody>
        </table>
      </div>
    </section>
  </div>;
}
