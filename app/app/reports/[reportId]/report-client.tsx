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
type GasOptimizerScope = {
  sourceHash?: string;
  daPricing?: { source: "receipt-calibrated"; groundTruthField: "l1Fee"; model: { sampleCount: number; zeroByteFeeWei: string; nonZeroByteFeeWei: string; maxValidationErrorPct: number; meanValidationErrorPct: number } | null };
  pricing?: {
    l2GasPriceWei?: string | null;
    creationBytecodeBytes?: number;
    mode?: "deterministic-calldata-estimate" | "calibrated-receipts";
    calldataZeroBytes?: number;
    calldataNonZeroBytes?: number;
    calldataGasEstimate?: number;
    deployDataFeeMnt?: string | null;
    pricedAt?: string;
    unavailableReason?: string;
    calibrationErrorPct?: number;
  };
  opportunities?: Array<{ id: string; title: string; severity?: Severity; lineStart: number | null; estimatedGasSaved: number | null; estimatedDataBytesSaved: number | null; annualizedBasis?: string }>;
  measurement?: {
    status: "measured" | "degraded" | "skipped";
    source: "foundry" | "deterministic-estimate";
    measuredAt: string;
    patches: Array<{ ruleId: string; status: "measured" | "estimated" | "skipped"; note: string }>;
    forge: { attempted: boolean; ok: boolean; command: string | null; error: string | null };
  } | null;
};
type ReportScope = Record<string, unknown> & { gasOptimizer?: GasOptimizerScope | null; lineCount?: number; pragma?: string; protocols?: string[] };
type Report = { id: string; scanId: string; contractName: string; riskScore: number; severityCounts: Record<string, number>; scope: ReportScope; executiveSummary: string; reportHash: string; createdAt: string; startedAt: string | null; finishedAt: string | null; scanDepth: string; network: string };

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
  const gasOptimizer = report.scope?.gasOptimizer ?? null;
  const pricedDeployFee = gasOptimizer?.pricing?.deployDataFeeMnt ? `${Number(gasOptimizer.pricing.deployDataFeeMnt).toFixed(6)} MNT` : "not measured";
  const l2GasPrice = gasOptimizer?.pricing?.l2GasPriceWei ? `${Number(gasOptimizer.pricing.l2GasPriceWei) / 1e9} gwei` : "unavailable";
  const gasOpportunities = gasOptimizer?.opportunities ?? [];
  const gasMeasurement = gasOptimizer?.measurement ?? null;
  const estimatedRuntimeGas = gasOpportunities.reduce((sum, item) => sum + (item.estimatedGasSaved ?? 0), 0);
  const estimatedDataBytes = gasOpportunities.reduce((sum, item) => sum + (item.estimatedDataBytesSaved ?? 0), 0);

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
    <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><p className="text-xs uppercase tracking-[0.12em] text-green-400">Gas Optimizer</p><div className="mt-3 grid gap-3 md:grid-cols-5"><Metric label="Creation bytecode" value={`${gasOptimizer?.pricing?.creationBytecodeBytes ?? "—"} bytes`} /><Metric label="Mantle L2 gas price" value={l2GasPrice} /><Metric label="Deploy L1/DA fee" value={pricedDeployFee} /><Metric label="Opportunities" value={String(gasOpportunities.length)} /><Metric label="Measurement" value={gasMeasurement ? `${gasMeasurement.status} · ${gasMeasurement.source}` : "pending"} /></div>{gasOptimizer?.pricing?.mode !== "calibrated-receipts" ? <p className="mt-3 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">DA fee is not calibrated yet: {gasOptimizer?.pricing?.unavailableReason ?? "receipt calibration unavailable"}</p> : <p className="mt-3 text-sm text-text-mid">Estimated from Mantle receipt ground truth (`l1Fee`) using a zero/nonzero calldata-byte calibration. Real deployed transactions use receipt `l1Fee` directly.</p>}</section>
    <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><p className="text-xs uppercase tracking-[0.12em] text-green-400">Key Takeaways</p><ul className="mt-3 grid gap-2 md:grid-cols-2">{takeaways.map((item) => <li key={item} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid">✓ {item}</li>)}</ul></section>

    <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
      <div className="flex flex-wrap gap-2">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={tab === item ? "rounded-pill border border-green-400/35 bg-green-400/10 px-3 py-1.5 text-sm text-green-400" : "rounded-pill border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-text-mid"}>{item}</button>)}</div>
      <div className="mt-4 flex flex-wrap gap-3"><label className="flex w-full sm:w-auto sm:min-w-72 flex-1 items-center gap-2 rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-low"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search findings…" className="w-full border-0 bg-transparent p-0 text-text-hi focus:ring-0" /></label><select value={severity} onChange={(event) => setSeverity(event.target.value as Severity | "all")} className="rounded-control border-border-subtle bg-surface-2 text-sm text-text-hi"><option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="info">Info</option></select></div>
      {tab === "Gas & Cost Optimizations" ? <GasOpportunityPanel opportunities={gasOpportunities} measurement={gasMeasurement} sourceHash={gasOptimizer?.sourceHash} model={gasOptimizer?.daPricing?.model ?? null} pricedAt={gasOptimizer?.pricing?.pricedAt} estimatedRuntimeGas={estimatedRuntimeGas} estimatedDataBytes={estimatedDataBytes} calldataGasEstimate={gasOptimizer?.pricing?.calldataGasEstimate} calibrationErrorPct={gasOptimizer?.pricing?.calibrationErrorPct} /> : null}
      <div className="mt-4 overflow-x-auto rounded-card border border-border-subtle"><table className="w-full text-left text-sm"><thead className="bg-surface-2 text-text-low"><tr><th className="p-3">Severity</th><th className="p-3">Category</th><th className="p-3">Title</th><th className="p-3">Lines</th><th className="p-3">File</th><th className="p-3">Status</th></tr></thead><tbody>{filtered.map((finding) => <tr key={finding.id} className="border-t border-border-subtle hover:bg-surface-2"><td className="p-3"><SeverityPill severity={finding.severity} size="sm" /></td><td className="p-3 text-text-mid">{finding.category}</td><td className="p-3"><Link href={`/app/reports/${report.id}/findings/${finding.id}`} className="text-text-hi hover:text-green-400">{finding.title}</Link></td><td className="p-3 font-mono text-text-low">{finding.lineStart ?? "?"}{finding.lineEnd && finding.lineEnd !== finding.lineStart ? `-${finding.lineEnd}` : ""}</td><td className="p-3 font-mono text-text-low">{finding.file}</td><td className="p-3 text-text-mid">{finding.status}</td></tr>)}{!filtered.length ? <tr><td colSpan={6} className="p-6 text-center text-text-low">No rows match this tab/filter.</td></tr> : null}</tbody></table></div>
    </section>
  </div>;
}

function InfoCard({ title, lines }: { title: string; lines: string[] }) {
  return <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><p className="text-xs uppercase tracking-[0.12em] text-green-400">{title}</p><div className="mt-4 space-y-2">{lines.map((line) => <p key={line} className="text-sm text-text-mid">{line}</p>)}</div></section>;
}

function GasOpportunityPanel({ opportunities, measurement, sourceHash, model, pricedAt, estimatedRuntimeGas, estimatedDataBytes, calldataGasEstimate, calibrationErrorPct }: { opportunities: NonNullable<GasOptimizerScope["opportunities"]>; measurement: NonNullable<GasOptimizerScope["measurement"]> | null; sourceHash?: string; model: NonNullable<GasOptimizerScope["daPricing"]>["model"] | null; pricedAt?: string; estimatedRuntimeGas: number; estimatedDataBytes: number; calldataGasEstimate?: number; calibrationErrorPct?: number }) {
  return <div className="mt-4 space-y-4 rounded-card border border-green-400/20 bg-green-400/[0.03] p-4">
    <div className="grid gap-3 md:grid-cols-4">
      <Metric label="Static runtime estimate" value={estimatedRuntimeGas ? `${estimatedRuntimeGas.toLocaleString()} gas` : "needs snapshot"} />
      <Metric label="Bytecode data estimate" value={estimatedDataBytes ? `${estimatedDataBytes.toLocaleString()} bytes` : "none detected"} />
      <Metric label="Calldata gas estimate" value={calldataGasEstimate ? calldataGasEstimate.toLocaleString() : "unavailable"} />
      <Metric label="Priced at" value={pricedAt ? new Date(pricedAt).toLocaleString() : "scan time"} />
    </div>
    <div className="rounded-control border border-border-subtle bg-terminal p-3 text-xs leading-5 text-text-low">
      <p><span className="text-text-mid">Source hash:</span> <span className="break-all font-mono">{sourceHash ?? "unavailable"}</span></p>
      <p><span className="text-text-mid">Mantle pricing:</span> receipt-calibrated model from `l1Fee` ground truth</p>
      <p><span className="text-text-mid">Validation:</span> {model ? `${model.sampleCount} samples · max error ${model.maxValidationErrorPct.toFixed(4)}% · mean error ${model.meanValidationErrorPct.toFixed(4)}%` : "unavailable"}</p>
      <p><span className="text-text-mid">Rates:</span> zero byte {model ? `${Number(model.zeroByteFeeWei).toLocaleString()} wei` : "—"} · nonzero byte {model ? `${Number(model.nonZeroByteFeeWei).toLocaleString()} wei` : "—"}</p>
      {calibrationErrorPct != null && calibrationErrorPct >= 10 ? <p className="mt-2 text-warning">Calibration error {calibrationErrorPct.toFixed(4)}% exceeds tolerance; deploy DA fee falls back to labeled deterministic estimate.</p> : null}
      {measurement ? <p className={measurement.status === "measured" ? "mt-2 text-success" : "mt-2 text-warning"}><span className="text-text-mid">Measurement:</span> {measurement.status} via {measurement.source}{measurement.forge.error ? ` — ${measurement.forge.error}` : ""}</p> : null}
    </div>
    <div className="grid gap-3 lg:grid-cols-3">
      {opportunities.map((item) => {
        const measuredPatch = measurement?.patches.find((patch) => patch.ruleId === item.id);
        return <article key={item.id} className="rounded-card border border-border-subtle bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-text-hi">{item.title}</h3>{item.severity ? <SeverityPill severity={item.severity} size="sm" /> : null}</div>
        <p className="mt-2 text-xs uppercase tracking-[0.12em] text-text-low">Line {item.lineStart ?? "?"}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><Metric label="Gas" value={item.estimatedGasSaved ? `${item.estimatedGasSaved.toLocaleString()}` : "—"} /><Metric label="Bytes" value={item.estimatedDataBytesSaved ? `${item.estimatedDataBytesSaved.toLocaleString()}` : "—"} /></div>
        <p className="mt-3 text-xs leading-5 text-text-mid">{item.annualizedBasis ?? "Static estimate; confirm exact delta with a queued gas snapshot before claiming savings."}</p>
        {measuredPatch ? <p className="mt-2 rounded-control border border-border-subtle bg-terminal px-2 py-1 text-xs text-text-low">{measuredPatch.status}: {measuredPatch.note}</p> : null}
      </article>;
      })}
      {!opportunities.length ? <div className="rounded-card border border-border-subtle bg-surface-1 p-5 text-sm text-text-mid lg:col-span-3">No static gas opportunities were detected for this scan. Mantle deploy pricing is still recorded above when compiled bytecode is available.</div> : null}
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-control border border-border-subtle bg-terminal p-3"><p className="text-xs uppercase tracking-[0.12em] text-text-low">{label}</p><p className="mt-1 font-mono text-sm text-text-hi">{value}</p></div>;
}
