import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { deterministicReportHash } from "@/lib/proof/canonical";
import { explorerTxUrl } from "@/lib/chain/mantle";
import { ArchonLogo, CopyButton, DegradedNotice, SeverityPill } from "@/components/archon";
import type { Severity } from "@/components/archon/severity";

type Report = { id: string; scanId: string; contractName: string; riskScore: number; severityCounts: Record<string, number>; scope: Record<string, unknown> | null; executiveSummary: string | null; createdAt: string; network: string; scanDepth: string; };
type Finding = { id: string; severity: Severity; category: string; title: string; file: string; lineStart: number | null; lineEnd: number | null; summary: string | null; confidence: string | number | null; status: string };
type Proof = { reportHash: string; txHash: string | null; metadataUri: string | null; metadata: Record<string, unknown> | null; loggedAt: string | null; verificationStatus: string | null; erc8004Ref: Record<string, unknown> | null };

export const dynamic = "force-dynamic";

export default async function PublicReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  // This public route is NOT under /app, so it has no error boundary — it must degrade
  // inline rather than 500. notFound() stays outside the try/catch (it throws a special
  // Next error we must not swallow).
  let report: Report | undefined;
  let findings: Finding[] = [];
  let proof: Proof | null = null;
  let degraded = false;
  try {
    const reportResult = await db.query<Report>(
      `select r.id, r.scan_id as "scanId", r.contract_name as "contractName", r.risk_score as "riskScore", r.severity_counts as "severityCounts", r.scope, r.executive_summary as "executiveSummary", r.created_at as "createdAt", s.network, s.scan_depth as "scanDepth"
       from reports r join scans s on s.id=r.scan_id where r.id=$1`,
      [reportId],
    );
    report = reportResult.rows[0];
    if (report) {
      const [findingsResult, proofResult] = await Promise.all([
        db.query<Finding>(`select id,severity,category,title,file,line_start as "lineStart",line_end as "lineEnd",summary,confidence,status from findings where report_id=$1 order by sort_index nulls last,id`, [reportId]),
        db.query<Proof>(`select report_hash as "reportHash", tx_hash as "txHash", metadata_uri as "metadataUri", metadata, logged_at as "loggedAt", verification_status as "verificationStatus", erc8004_ref as "erc8004Ref" from proofs where report_id=$1 order by logged_at desc nulls last, created_at desc limit 1`, [reportId]),
      ]);
      findings = findingsResult.rows;
      proof = proofResult.rows[0] ?? null;
    }
  } catch (error) {
    degraded = true;
    logger.error({ err: error instanceof Error ? error.message : String(error), reportId }, "public report data fetch failed; rendering degraded state");
  }
  if (degraded) {
    return <main className="min-h-screen bg-canvas text-text-hi"><header className="border-b border-border-subtle bg-surface-1/80"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4"><ArchonLogo/><Link href="/app/audit/new" className="rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-canvas">Run your own audit</Link></div></header><div className="mx-auto max-w-2xl px-5 py-16"><DegradedNotice resource="This public report"/></div></main>;
  }
  if (!report) notFound();
  const rederived = proof?.metadata ? deterministicReportHash(proof.metadata) : null;
  const verified = Boolean(proof?.reportHash && rederived === proof.reportHash && proof.txHash);
  const counts = report.severityCounts ?? {};
  return <main className="min-h-screen bg-canvas text-text-hi">
    <header className="border-b border-border-subtle bg-surface-1/80"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4"><ArchonLogo/><div className="flex items-center gap-2"><span className="rounded-pill border border-success/30 bg-success/10 px-3 py-1 text-sm text-success">Public verified report</span><Link href="/app/audit/new" className="rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-canvas">Run your own audit</Link></div></div></header>
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      <section className="rounded-card border border-border-subtle bg-surface-1 p-6"><p className="text-xs uppercase tracking-[0.14em] text-green-400">Archon public report</p><div className="mt-3 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-4xl font-bold tracking-tight">{report.contractName}</h1><p className="mt-2 text-text-mid">Mantle Mainnet · scan depth {report.scanDepth} · generated {new Date(report.createdAt).toLocaleString()}</p></div><div className="rounded-card border border-warning/30 bg-warning/10 p-4 text-center"><p className="text-xs uppercase tracking-[0.12em] text-warning">Risk Score</p><p className="text-4xl font-bold text-warning">{report.riskScore}</p></div></div><p className="mt-5 max-w-4xl leading-7 text-text-mid">{report.executiveSummary ?? "This report contains Archon risk intelligence and recommended fixes. It is not a guarantee of safety."}</p></section>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><section className="rounded-card border border-border-subtle bg-surface-1 p-5"><h2 className="text-xl font-semibold">Findings</h2><div className="mt-3 flex flex-wrap gap-2 text-xs">{Object.entries(counts).map(([key,value]) => <span key={key} className="rounded-pill border border-border-subtle bg-surface-2 px-2 py-1 text-text-mid">{key}: {String(value)}</span>)}</div><div className="mt-4 overflow-hidden rounded-card border border-border-subtle"><table className="w-full text-left text-sm"><thead className="bg-surface-2 text-text-low"><tr><th className="p-3">Severity</th><th className="p-3">Finding</th><th className="p-3">Location</th><th className="p-3">Confidence</th></tr></thead><tbody>{findings.map((finding) => <tr key={finding.id} className="border-t border-border-subtle"><td className="p-3"><SeverityPill severity={finding.severity}/></td><td className="p-3"><p className="font-semibold text-text-hi">{finding.title}</p><p className="mt-1 line-clamp-2 text-text-mid">{finding.summary}</p></td><td className="p-3 font-mono text-text-low">{finding.file}:{finding.lineStart ?? "?"}</td><td className="p-3 text-green-400">{Math.round(Number(finding.confidence ?? 0) * 100)}%</td></tr>)}{!findings.length ?<tr><td colSpan={4} className="p-8 text-center text-text-low">No findings are attached to this report.</td></tr> : null}</tbody></table></div></section>
      <aside className="space-y-4"><section className="rounded-card border border-border-subtle bg-surface-1 p-5"><h2 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className={verified ? "text-success" : "text-warning"}/> Proof Verification</h2><div className="mt-4 space-y-3 text-sm"><Line label="Stored report hash" value={proof?.reportHash ?? "No proof row"}/><Line label="Re-derived hash" value={rederived ?? "No metadata"}/><Line label="Metadata URI" value={proof?.metadataUri ?? "No metadata URI"}/><Line label="Result" value={verified ? "Hash match + ERC-8004 Reputation tx present" : "Not fully verified"}/>{proof?.txHash ? <a href={explorerTxUrl(proof.txHash)} target="_blank" className="inline-flex items-center gap-2 rounded-control border border-green-400/35 bg-green-400/10 px-3 py-2 text-green-400">Mantlescan <ExternalLink size={14}/></a> : null}</div></section><section className="rounded-card border border-border-subtle bg-surface-1 p-5"><h2 className="text-xl font-semibold">ERC-8004 Reference</h2><pre className="mt-3 max-h-56 overflow-auto rounded-card bg-terminal p-3 text-xs text-text-code">{JSON.stringify(proof?.erc8004Ref ?? {}, null, 2)}</pre></section><section className="rounded-card border border-border-subtle bg-surface-1 p-5"><h2 className="text-xl font-semibold">Careful scope</h2><p className="mt-2 text-sm leading-6 text-text-mid">Archon reports are risk intelligence with confidence scores and recommended fixes. They are not guarantees, certifications, or claims that a contract is safe.</p></section></aside></div>
    </div>
  </main>;
}
function Line({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase tracking-[0.12em] text-text-low">{label}</p><p className="mt-1 break-all font-mono text-text-hi">{value} <CopyButton value={value}/></p></div>; }
