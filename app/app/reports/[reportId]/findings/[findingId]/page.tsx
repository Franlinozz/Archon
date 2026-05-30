import type React from "react";
import type { QueryResultRow } from "pg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, MoreHorizontal } from "lucide-react";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { DegradedNotice, SeverityPill } from "@/components/archon";
import type { Severity } from "@/components/archon/severity";
import { GenerateFindingTestButton } from "./GenerateFindingTestButton";

type Finding = {
  id: string; severity: Severity; category: string; title: string; file: string; lineStart: number | null; lineEnd: number | null; codeSnippet: string | null; summary: string | null; whyMantle: string | null; exploitScenario: string | null; recommendedFix: string | null; patchDiff: string | null; confidence: string | number | null; gasImpact: string | null; status: string;
};

export default async function Page({ params }: { params: Promise<{ reportId: string; findingId: string }> }) {
  const { reportId, findingId } = await params;
  let report: QueryResultRow | undefined;
  let findings: Finding[] = [];
  let degraded = false;
  try {
    const reportResult = await db.query(`select r.id, r.contract_name as "contractName", r.scope, s.source_code as "sourceCode" from reports r join scans s on s.id=r.scan_id where r.id=$1`, [reportId]);
    report = reportResult.rows[0];
    if (report) {
      const findingsResult = await db.query<Finding>(
        `select id, severity, category, title, file, line_start as "lineStart", line_end as "lineEnd", code_snippet as "codeSnippet", summary, why_mantle as "whyMantle", exploit_scenario as "exploitScenario", recommended_fix as "recommendedFix", patch_diff as "patchDiff", confidence, gas_impact as "gasImpact", status
         from findings where report_id=$1 order by sort_index nulls last, id`,
        [reportId],
      );
      findings = findingsResult.rows;
    }
  } catch (error) {
    degraded = true;
    logger.error({ err: error instanceof Error ? error.message : String(error), reportId, findingId }, "finding detail data fetch failed; rendering degraded state");
  }
  if (degraded) return <div className="space-y-6"><DegradedNotice resource="This finding"/></div>;
  if (!report) notFound();
  const index = findings.findIndex((finding) => finding.id === findingId);
  const finding = findings[index];
  if (!finding) notFound();
  const previous = findings[index - 1];
  const next = findings[index + 1];
  const source = report.sourceCode || finding.codeSnippet || "";
  const patchOk = Boolean(finding.patchDiff && finding.patchDiff.includes("---") && finding.patchDiff.includes("+++") && (finding.patchDiff.includes("+") || finding.patchDiff.includes("-")));

  return <div className="space-y-6">
    <header className="rounded-card border border-border-subtle bg-surface-1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3"><Link href={`/app/reports/${reportId}`} className="text-sm text-green-400">← Back to report</Link><div className="flex flex-wrap items-center gap-3"><SeverityPill severity={finding.severity} /><span className="font-mono text-xs text-text-low">{finding.id}</span></div><h1 className="text-3xl font-bold tracking-tight text-text-hi">{finding.title}</h1><p className="text-sm text-text-mid">{report.contractName} · {finding.category} · {finding.file}:{finding.lineStart ?? "?"} · status {finding.status}</p></div>
        <div className="flex flex-wrap gap-2"><NavButton finding={previous} reportId={reportId} label="Previous" icon="prev" /><NavButton finding={next} reportId={reportId} label="Next" icon="next" /><span className="inline-flex items-center gap-2 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"><MoreHorizontal size={15}/> Actions · Coming soon</span></div>
      </div>
    </header>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
      <main className="space-y-4">
        <section className="rounded-card border border-border-subtle bg-terminal p-4">
          <div className="mb-3 flex items-center justify-between text-sm"><span className="text-text-mid">CodePanel · highlighted vulnerable range</span><span className="font-mono text-text-low">{finding.file}</span></div>
          <HighlightedCode code={source} start={finding.lineStart} end={finding.lineEnd} />
          <div className="mt-3 grid gap-2 md:grid-cols-2"><Annotation title="Trace source" body="Line range is copied from deterministic Slither/rule output." /><Annotation title={finding.category.includes("reentrancy") ? "External Call / State Update After Call" : "Inline Annotation"} body={finding.summary ?? "Review this line range with the recommended fix."} /></div>
        </section>

        <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold text-text-hi">Suggested Patch / Diff View</h2><GenerateFindingTestButton reportId={reportId} findingId={finding.id} /></div>
          {patchOk ? <DiffView diff={finding.patchDiff!} /> : <div className="grid gap-3 md:grid-cols-2"><pre className="overflow-auto rounded-card bg-terminal p-4 text-xs text-text-code">{finding.codeSnippet ?? "Original snippet unavailable"}</pre><pre className="overflow-auto rounded-card bg-terminal p-4 text-xs text-text-code">{finding.recommendedFix ?? "Apply the recommended fix and add a regression test."}</pre></div>}
        </section>
      </main>

      <aside className="space-y-4">
        <DetailCard title="Severity"><SeverityPill severity={finding.severity} /></DetailCard>
        <DetailCard title="Summary">{finding.summary}</DetailCard>
        <DetailCard title="Why It Matters on Mantle">{finding.whyMantle}</DetailCard>
        <DetailCard title="Exploit Scenario">{finding.exploitScenario}</DetailCard>
        <DetailCard title="Recommended Fix">{finding.recommendedFix}</DetailCard>
        <DetailCard title="Gas Impact">{finding.gasImpact ?? "No direct gas impact was identified for this finding."}</DetailCard>
        <DetailCard title="Confidence"><span className="font-mono text-2xl text-green-400">{Math.round(Number(finding.confidence ?? 0) * 100)}%</span></DetailCard>
        <DetailCard title="References"><ul className="list-disc space-y-1 pl-4"><li>Deterministic source: {finding.category}</li><li>File: {finding.file}</li><li>Lines: {finding.lineStart ?? "?"}{finding.lineEnd && finding.lineEnd !== finding.lineStart ? `-${finding.lineEnd}` : ""}</li></ul></DetailCard>
      </aside>
    </div>
  </div>;
}

function NavButton({ finding, reportId, label, icon }: { finding?: Finding; reportId: string; label: string; icon: "prev" | "next" }) {
  const content = <>{icon === "prev" ? <ArrowLeft size={15}/> : null}{label}{icon === "next" ? <ArrowRight size={15}/> : null}</>;
  if (!finding) return <button disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-low">{content}</button>;
  return <Link href={`/app/reports/${reportId}/findings/${finding.id}`} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid hover:text-green-400">{content}</Link>;
}

function HighlightedCode({ code, start, end }: { code: string; start: number | null; end: number | null }) {
  const lines = code.split("\n");
  const from = Math.max(1, (start ?? 1) - 6);
  const to = Math.min(lines.length, (end ?? start ?? 1) + 6);
  return <pre className="max-h-[560px] overflow-auto rounded-card border border-border-subtle bg-terminal p-0 font-mono text-xs leading-6 text-text-code">{lines.slice(from - 1, to).map((line, offset) => { const n = from + offset; const active = start && n >= start && n <= (end ?? start); return <div key={n} className={active ? "bg-danger/15 text-text-hi" : ""}><span className="mr-4 inline-block w-10 select-none border-r border-border-subtle pr-2 text-right text-text-low">{n}</span>{line || " "}</div>; })}</pre>;
}

function Annotation({ title, body }: { title: string; body: string }) { return <div className="rounded-card border border-green-400/20 bg-green-400/10 p-3"><p className="text-sm font-medium text-green-400">{title}</p><p className="mt-1 text-xs leading-5 text-text-mid">{body}</p></div>; }
function DetailCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-card border border-border-subtle bg-surface-1 p-4"><p className="mb-2 text-xs uppercase tracking-[0.12em] text-green-400">{title}</p><div className="text-sm leading-6 text-text-mid">{children ?? "Not provided."}</div></section>; }
function DiffView({ diff }: { diff: string }) { return <pre className="overflow-auto rounded-card border border-border-subtle bg-terminal p-4 font-mono text-xs leading-6">{diff.split("\n").map((line, index) => <div key={`${index}-${line}`} className={line.startsWith("+") && !line.startsWith("+++") ? "bg-success/10 text-success" : line.startsWith("-") && !line.startsWith("---") ? "bg-danger/10 text-danger" : "text-text-code"}>{line || " "}</div>)}</pre>; }
