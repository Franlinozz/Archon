"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Download, Search, Share2 } from "lucide-react";
import { GenerateProofModal } from "./GenerateProofModal";
import { RiskScoreCard, SeverityPill } from "@/components/archon";
import type { Severity } from "@/components/archon/severity";

const tabs = ["Findings", "Mantle-Specific Risks", "Gas & Cost Optimizations", "Recommended Fixes", "Next Actions"] as const;
const severityColors: Record<string, string> = { critical: "var(--danger)", high: "var(--high)", medium: "var(--warning)", low: "var(--success)", info: "var(--info)" };

type Finding = { id: string; severity: Severity; category: string; title: string; file: string; lineStart: number | null; lineEnd: number | null; summary: string | null; recommendedFix: string | null; whyMantle: string | null; gasImpact: string | null; status: string };
type Report = { id: string; scanId: string; contractName: string; riskScore: number; severityCounts: Record<string, number>; scope: Record<string, unknown>; executiveSummary: string; reportHash: string; createdAt: string; startedAt: string | null; finishedAt: string | null; scanDepth: string; network: string };

export function ReportClient({ report, findings }: { report: Report; findings: Finding[] }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Findings");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity | "all">("all");

  const chartData = Object.entries(report.severityCounts ?? {}).filter(([, value]) => Number(value) > 0).map(([name, value]) => ({ name, value }));
  const filtered = useMemo(() => findings.filter((finding) => {
    const text = `${finding.title} ${finding.category} ${finding.file}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (severity !== "all" && finding.severity !== severity) return false;
    if (tab === "Mantle-Specific Risks") return Boolean(finding.whyMantle) || finding.category.includes("mantle");
    if (tab === "Gas & Cost Optimizations") return Boolean(finding.gasImpact) || /gas|cache|optimization/i.test(finding.category);
    if (tab === "Recommended Fixes") return Boolean(finding.recommendedFix);
    if (tab === "Next Actions") return finding.severity === "critical" || finding.severity === "high";
    return true;
  }), [findings, query, severity, tab]);

  const takeaways = findings.slice(0, 4).map((finding) => `${finding.severity.toUpperCase()}: ${finding.title} in ${finding.file}:${finding.lineStart ?? "?"}`);
  const duration = report.startedAt && report.finishedAt ? `${Math.max(1, Math.round((Date.parse(report.finishedAt) - Date.parse(report.startedAt)) / 1000))}s` : "n/a";

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="text-sm text-text-low"><Link href="/app" className="hover:text-green-400">Workspace</Link> / <span>Audit Report</span></div>
        <div className="mt-3 flex items-center gap-3"><h1 className="text-4xl font-bold tracking-tight text-text-hi">Audit Report</h1><span className="rounded-pill border border-success/30 bg-success/10 px-3 py-1 text-sm text-success">Completed</span></div>
        <p className="mt-2 text-text-mid">{report.contractName} · Mantle Mainnet · Chain ID 5000 · Scan {report.scanId}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => navigator.clipboard.writeText(window.location.href)} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid"><Share2 size={15}/> Copy Report Link</button>
        <a download={`archon-report-${report.id}.json`} href={`/api/reports/${report.id}`} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-green-400"><Download size={15}/> Download JSON</a>
        <GenerateProofModal reportId={report.id} />
      </div>
    </div>

    <div className="grid gap-4 xl:grid-cols-4">
      <RiskScoreCard score={report.riskScore} severity={report.riskScore >= 85 ? "critical" : report.riskScore >= 65 ? "high" : "medium"} />
      <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><p className="text-xs uppercase tracking-[0.12em] text-green-400">Severity Distribution</p><div className="mt-3 h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`} outerRadius={76}>{chartData.map((entry) => <Cell key={entry.name} fill={severityColors[entry.name] ?? "var(--text-low)"} />)}</Pie><Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-hi)" }}/><Legend /></PieChart></ResponsiveContainer></div></section>
      <InfoCard title="Scope" lines={[`${report.contractName}`, `${String(report.scope?.lineCount ?? "?")} lines`, `Solidity ${String(report.scope?.pragma ?? "^0.8.24")}`, `Scan depth ${report.scanDepth}`]} />
      <InfoCard title="Protocol" lines={["Mantle Mainnet", "Chain ID 5000", `Duration ${duration}`, `Protocols ${(report.scope?.protocols as string[] | undefined)?.join(", ") ?? "selected"}`]} />
    </div>

    <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><p className="text-xs uppercase tracking-[0.12em] text-green-400">Executive Summary</p><p className="mt-3 max-w-5xl leading-7 text-text-mid">{report.executiveSummary}</p></section>
    <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><p className="text-xs uppercase tracking-[0.12em] text-green-400">Key Takeaways</p><ul className="mt-3 grid gap-2 md:grid-cols-2">{takeaways.map((item) => <li key={item} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid">✓ {item}</li>)}</ul></section>

    <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
      <div className="flex flex-wrap gap-2">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={tab === item ? "rounded-pill border border-green-400/35 bg-green-400/10 px-3 py-1.5 text-sm text-green-400" : "rounded-pill border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-text-mid"}>{item}</button>)}</div>
      <div className="mt-4 flex flex-wrap gap-3"><label className="flex min-w-72 flex-1 items-center gap-2 rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-low"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search findings…" className="w-full border-0 bg-transparent p-0 text-text-hi focus:ring-0" /></label><select value={severity} onChange={(event) => setSeverity(event.target.value as Severity | "all")} className="rounded-control border-border-subtle bg-surface-2 text-sm text-text-hi"><option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="info">Info</option></select></div>
      <div className="mt-4 overflow-hidden rounded-card border border-border-subtle"><table className="w-full text-left text-sm"><thead className="bg-surface-2 text-text-low"><tr><th className="p-3">Severity</th><th className="p-3">Category</th><th className="p-3">Title</th><th className="p-3">Lines</th><th className="p-3">File</th><th className="p-3">Status</th></tr></thead><tbody>{filtered.map((finding) => <tr key={finding.id} className="border-t border-border-subtle hover:bg-surface-2"><td className="p-3"><SeverityPill severity={finding.severity} size="sm" /></td><td className="p-3 text-text-mid">{finding.category}</td><td className="p-3"><Link href={`/app/reports/${report.id}/findings/${finding.id}`} className="text-text-hi hover:text-green-400">{finding.title}</Link></td><td className="p-3 font-mono text-text-low">{finding.lineStart ?? "?"}{finding.lineEnd && finding.lineEnd !== finding.lineStart ? `-${finding.lineEnd}` : ""}</td><td className="p-3 font-mono text-text-low">{finding.file}</td><td className="p-3 text-text-mid">{finding.status}</td></tr>)}{!filtered.length ? <tr><td colSpan={6} className="p-6 text-center text-text-low">No rows match this tab/filter.</td></tr> : null}</tbody></table></div>
    </section>
  </div>;
}

function InfoCard({ title, lines }: { title: string; lines: string[] }) {
  return <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><p className="text-xs uppercase tracking-[0.12em] text-green-400">{title}</p><div className="mt-4 space-y-2">{lines.map((line) => <p key={line} className="text-sm text-text-mid">{line}</p>)}</div></section>;
}
