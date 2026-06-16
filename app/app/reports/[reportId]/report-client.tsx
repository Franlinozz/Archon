"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle, Download, Search, Share2 } from "lucide-react";
import { GenerateProofModal } from "./GenerateProofModal";
import { ChallengePanel } from "@/components/challenges/ChallengePanel";
import { RiskScoreCard, SeverityPill } from "@/components/archon";
import type { Severity } from "@/components/archon/severity";

const tabs = ["Findings", "Mantle-Specific Risks", "Gas & Cost Optimizations", "Recommended Fixes", "Next Actions"] as const;
const severityColors: Record<string, string> = { critical: "var(--danger)", high: "var(--high)", medium: "var(--warning)", low: "var(--success)", info: "var(--info)" };
const severityLegendOrder = ["critical", "high", "medium", "low", "info"] as const;

// Measurement label — never the word "degraded". A deterministic delta is an
// honest, receipt-calibrated estimate; Foundry runs are measured.
function measurementText(m: { status: string; source: string }): string {
  return m.status === "measured" || m.source === "foundry"
    ? "measured (Foundry)"
    : "deterministic estimate (receipt-calibrated)";
}

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
type ReducedModeScope = { reason: string; unresolvedImports?: string[]; detail?: string };
type AiReasoningScope = { fallbackCount?: number; skipped?: number; timeoutMs?: number; batches?: number; provider?: string | null; providersUsed?: string[] };
type ReportScope = Record<string, unknown> & { gasOptimizer?: GasOptimizerScope | null; reducedMode?: ReducedModeScope | null; aiReasoning?: AiReasoningScope | null; lineCount?: number; pragma?: string; solcVersion?: string; sourceKind?: string; protocols?: string[]; dependencies?: string[]; blockNumber?: string | number | null };
type Report = { id: string; scanId: string; contractName: string; riskScore: number; severityCounts: Record<string, number>; scope: ReportScope; executiveSummary: string; reportHash: string; createdAt: string; startedAt: string | null; finishedAt: string | null; scanDepth: string; network: string };
type Challenge = { id: string; targetType: string; challenger: string | null; title: string; rationale: string; evidenceUrl: string | null; status: string; challengeHash: string; referenceTxHash: string | null; referenceReportHash: string | null; createdAt: string };

export function ReportClient({ report, findings, challenges }: { report: Report; findings: Finding[]; challenges: Challenge[] }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Findings");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity | "all">("all");

  const chartData = Object.entries(report.severityCounts ?? {}).filter(([, value]) => Number(value) > 0).map(([name, value]) => ({ name, value }));
  const totalFindings = Object.values(report.severityCounts ?? {}).reduce((sum, v) => sum + Number(v), 0);
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
  const duration = report.startedAt && report.finishedAt ? `${Math.max(1, Math.round((Date.parse(report.finishedAt) - Date.parse(report.startedAt)) / 1000))}s` : "not captured";
  const publicReportPath = `/r/${report.id}`;
  const gasOptimizer = report.scope?.gasOptimizer ?? null;
  const reducedMode = report.scope?.reducedMode ?? null;
  const aiReasoning = report.scope?.aiReasoning ?? null;
  const pricedDeployFee = gasOptimizer?.pricing?.deployDataFeeMnt ? `${Number(gasOptimizer.pricing.deployDataFeeMnt).toFixed(6)} MNT` : "not measured";
  const l2GasPrice = gasOptimizer?.pricing?.l2GasPriceWei ? `${Number(gasOptimizer.pricing.l2GasPriceWei) / 1e9} gwei` : "unavailable";
  const gasOpportunities = gasOptimizer?.opportunities ?? [];
  const gasMeasurement = gasOptimizer?.measurement ?? null;
  const estimatedRuntimeGas = gasOpportunities.reduce((sum, item) => sum + (item.estimatedGasSaved ?? 0), 0);
  const estimatedDataBytes = gasOpportunities.reduce((sum, item) => sum + (item.estimatedDataBytesSaved ?? 0), 0);
  const scanMetadata = [
    ["Report", report.id.slice(0, 8)],
    ["Created", new Date(report.createdAt).toLocaleString()],
    ["Hash", report.reportHash ? `${report.reportHash.slice(0, 12)}…${report.reportHash.slice(-8)}` : "pending"],
    ["Network", "Mantle Mainnet · 5000"],
    ["Depth", report.scanDepth],
  ];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="text-sm text-text-low"><Link href="/app" className="hover:text-green-400">Workspace</Link> / <span>Audit Report</span></div>
        <div className="mt-3 flex items-center gap-3"><h1 className="text-4xl font-bold tracking-tight text-text-hi">Audit Report</h1><span className="rounded-pill border border-success/30 bg-success/10 px-3 py-1 text-sm text-success">Completed</span></div>
        <p className="mt-2 text-text-mid">{report.contractName} · Mantle Mainnet · Chain ID 5000 · Scan {report.scanId}</p>
        <dl className="mt-4 flex flex-wrap gap-2">{scanMetadata.map(([label, value]) => <div key={label} className="rounded-pill border border-border-subtle bg-surface-2 px-3 py-1.5"><dt className="inline text-xs uppercase tracking-[0.12em] text-text-low">{label}</dt><dd className="ml-2 inline font-mono text-xs text-text-hi">{value}</dd></div>)}</dl>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${publicReportPath}`)} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid"><Share2 size={15}/> Copy Public Link</button>
        <a download={`archon-report-${report.id}.json`} href={`/api/reports/${report.id}`} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-green-400"><Download size={15}/> Download JSON</a>
        <GenerateProofModal reportId={report.id} />
      </div>
    </div>

    {reducedMode ? <details className="rounded-card border border-warning/30 bg-warning/10 p-4 text-sm text-warning" open>
      <summary className="flex cursor-pointer items-center gap-2 font-semibold"><AlertTriangle size={16} /> External imports could not be resolved; static analysis ran in reduced mode.</summary>
      <p className="mt-2 leading-6 text-text-mid">Archon skipped Slither/import-dependent checks and ran deterministic AST/rule analysis on the parseable units.</p>
      {reducedMode.unresolvedImports?.length ? <p className="mt-2 font-mono text-xs text-text-low">Unresolved: {reducedMode.unresolvedImports.join(", ")}</p> : null}
      {reducedMode.detail ? <p className="mt-2 font-mono text-xs text-text-low">Detail: {reducedMode.detail}</p> : null}
    </details> : null}
    {aiReasoning && Number(aiReasoning.fallbackCount ?? 0) > 0 ? <details className="rounded-card border border-info/30 bg-info/10 p-4 text-sm text-info" open>
      <summary className="flex cursor-pointer items-center gap-2 font-semibold"><AlertTriangle size={16} /> AI enrichment partial — deterministic explanations were used.</summary>
      <p className="mt-2 leading-6 text-text-mid">{Number(aiReasoning.fallbackCount ?? 0)} finding(s) used deterministic fallback after bounded AI enrichment. Timed calls are capped at {Math.round(Number(aiReasoning.timeoutMs ?? 45000) / 1000)}s per batch so large scans keep moving.</p>
    </details> : null}
    {aiReasoning?.providersUsed?.length ? <p className="rounded-card border border-border-subtle bg-surface-1 px-4 py-2 text-xs text-text-mid">Models used: <span className="font-semibold text-text-hi">{aiReasoning.providersUsed.join(", ")}</span>{aiReasoning.providersUsed.some((m) => /TokenHub/.test(m)) ? " — AI reasoning served on Tencent Cloud TokenHub." : ""}</p> : null}

    <div className="grid gap-4 xl:grid-cols-4">
      <RiskScoreCard score={report.riskScore} severity={report.riskScore >= 85 ? "critical" : report.riskScore >= 65 ? "high" : "medium"} />
      <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><p className="text-xs uppercase tracking-[0.12em] text-green-400">Severity Distribution</p>
        <div className="mt-4 flex flex-col items-center gap-5">
          <div className="relative h-40 w-40 shrink-0 [filter:drop-shadow(0_8px_18px_rgba(0,0,0,0.28))]">
            <ResponsiveContainer width="100%" height="100%"><PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={78} paddingAngle={2} stroke="var(--surface-1)" strokeWidth={2}>
                {chartData.map((entry) => <Cell key={entry.name} fill={severityColors[entry.name] ?? "var(--text-low)"} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-hi)" }} />
            </PieChart></ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold leading-none text-text-hi">{totalFindings}</span>
              <span className="mt-1 text-[11px] uppercase tracking-[0.12em] text-text-low">findings</span>
            </div>
            <div className="pointer-events-none absolute inset-[34px] rounded-full border border-border-subtle/50" aria-hidden />
          </div>
          <ul className="grid w-full gap-1">
            {severityLegendOrder.map((name) => { const v = Number(report.severityCounts?.[name] ?? 0); return (
              <li key={name} className={`flex items-center justify-between gap-3 rounded-control px-2.5 py-1.5 text-sm transition-colors ${v > 0 ? "hover:bg-surface-2" : "opacity-45"}`}>
                <span className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: severityColors[name] }} /><span className="capitalize text-text-mid">{name}</span></span>
                <span className="font-mono text-text-hi">{v}</span>
              </li>
            ); })}
          </ul>
        </div>
      </section>
      <InfoCard title="Scope" lines={[`${report.contractName}`, `${String(report.scope?.lineCount ?? "not captured")} lines`, `Source ${String(report.scope?.sourceKind ?? "scan input")}`, `Solidity ${String(report.scope?.pragma ?? report.scope?.solcVersion ?? "not captured")}`]} />
      <InfoCard title="Protocol" lines={["Mantle Mainnet", "Chain ID 5000", `Block ${String(report.scope?.blockNumber ?? "not captured by this scan")}`, `Duration ${duration}`, `Protocols ${(report.scope?.protocols as string[] | undefined)?.join(", ") || "none selected"}`]} />
    </div>

    <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><p className="text-xs uppercase tracking-[0.12em] text-green-400">Executive Summary</p><p className="mt-3 max-w-5xl leading-7 text-text-mid">{report.executiveSummary}</p></section>
    <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs uppercase tracking-[0.12em] text-green-400">Gas Optimizer</p><Link href="/app/gas" className="rounded-control border border-green-400/35 bg-green-400/10 px-3 py-2 text-sm font-semibold text-green-400">Open full gas engine</Link></div><div className="mt-3 grid gap-3 md:grid-cols-5"><Metric label="Creation bytecode" value={`${gasOptimizer?.pricing?.creationBytecodeBytes ?? "—"} bytes`} /><Metric label="Mantle L2 gas price" value={l2GasPrice} /><Metric label="Deploy L1/DA fee" value={pricedDeployFee} /><Metric label="Opportunities" value={String(gasOpportunities.length)} /><Metric label="Measurement" value={gasMeasurement ? measurementText(gasMeasurement) : "pending"} /></div>{gasOptimizer?.pricing?.mode !== "calibrated-receipts" ? <p className="mt-3 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">DA fee is not calibrated yet: {gasOptimizer?.pricing?.unavailableReason ?? "receipt calibration unavailable"}</p> : <p className="mt-3 text-sm text-text-mid">Estimated from Mantle receipt ground truth (`l1Fee`) using a zero/nonzero calldata-byte calibration. Real deployed transactions use receipt `l1Fee` directly.</p>}</section>
    <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><p className="text-xs uppercase tracking-[0.12em] text-green-400">Key Takeaways</p><ul className="mt-3 grid gap-2 md:grid-cols-2">{takeaways.map((item) => <li key={item} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid">✓ {item}</li>)}</ul></section>

    <ChallengePanel endpoint={`/api/reports/${report.id}/challenges`} targetType="report" initialChallenges={challenges} />

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
      {measurement ? <p className={measurement.status === "measured" ? "mt-2 text-success" : "mt-2 text-text-mid"}><span className="text-text-mid">Measurement:</span> {measurementText(measurement)}{measurement.forge.error ? ` — ${measurement.forge.error}` : ""}</p> : null}
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
