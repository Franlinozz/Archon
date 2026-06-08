"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, Clock, FileSearch, ShieldAlert, TrendingDown, Zap } from "lucide-react";

type CostGuardSummary = {
  totalReports?: number;
  doneReports?: number;
  activeReports?: number;
  failedReports?: number;
  annualSavingsUsd?: string | number;
  l2GasSavedPerCall?: string | number;
  l1DaWeiSavedPerCall?: string | number;
  lastFinishedAt?: string | null;
};

type CostGuardReport = {
  id: string;
  contractName: string | null;
  sourceKind: string | null;
  sourceRef: string | null;
  status: string;
  progress: number | null;
  currentStage: string | null;
  totals: Record<string, unknown> | null;
  assumptions: Record<string, unknown> | null;
  reportHash: string | null;
  anchorTxHash: string | null;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
};

type CostGuardOptimization = {
  id: string;
  gasReportId: string;
  contractName: string | null;
  title: string;
  category: string | null;
  location: string | null;
  safety: string | null;
  measurementLabel: string | null;
  measuredL2Delta: number | null;
  estL2Delta: number | null;
  measuredL1DeltaWei: string | number | null;
  estL1DeltaWei: string | number | null;
  annualSavingsUsd: string | number | null;
  rankScore: string | number | null;
};

export type CostGuardSnapshot = {
  summary: CostGuardSummary;
  recentReports: CostGuardReport[];
  topOptimizations: CostGuardOptimization[];
};

export function CostGuardClient({ snapshot }: { snapshot: CostGuardSnapshot }) {
  const summary = snapshot.summary;
  const hasReports = snapshot.recentReports.length > 0;
  const annualSavings = formatUsd(summary.annualSavingsUsd);
  const l2GasSaved = formatNumber(summary.l2GasSavedPerCall);
  const l1DaSaved = formatWei(summary.l1DaWeiSavedPerCall);

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-green-400">Cost Guard</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Real Mantle gas telemetry from Archon runs.</h1>
        <p className="mt-2 max-w-3xl text-text-mid">This page only reads persisted gas reports and optimization rows. If a metric is not available yet, Archon shows an empty state instead of sample spend charts.</p>
      </div>
      <span className="rounded-pill border border-success/30 bg-success/10 px-3 py-1 text-xs uppercase tracking-[0.12em] text-success">No mock telemetry</span>
    </header>

    <section className="grid gap-4 md:grid-cols-4">
      <Metric icon={<FileSearch size={18} />} label="Gas reports" value={formatNumber(summary.totalReports)} note={`${formatNumber(summary.doneReports)} complete · ${formatNumber(summary.activeReports)} active`} />
      <Metric icon={<TrendingDown size={18} />} label="Annual savings" value={annualSavings} note="summed from persisted optimizations" />
      <Metric icon={<Zap size={18} />} label="L2 gas saved / call" value={l2GasSaved} note="measured first, estimated when labeled" />
      <Metric icon={<ShieldAlert size={18} />} label="L1/DA wei saved / call" value={l1DaSaved} note="from Mantle gas report totals" />
    </section>

    {!hasReports ? <EmptyTelemetry /> : <>
      <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-text-hi">Recent real gas reports</h2>
            <p className="mt-1 text-sm text-text-mid">Latest persisted runs from the gas optimizer queue.</p>
          </div>
          <Link href="/app/gas" className="inline-flex items-center gap-2 rounded-control bg-green-400 px-4 py-2 font-semibold text-canvas">Run gas optimizer <ArrowRight size={16}/></Link>
        </div>
        <div className="mt-4 overflow-x-auto rounded-card border border-border-subtle">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-text-low"><tr><th className="p-3">Contract</th><th className="p-3">Source</th><th className="p-3">Status</th><th className="p-3">Savings</th><th className="p-3">Created</th></tr></thead>
            <tbody>{snapshot.recentReports.map((report) => <tr key={report.id} className="border-t border-border-subtle hover:bg-surface-2"><td className="p-3"><Link href={`/app/gas/${report.id}`} className="font-semibold text-text-hi hover:text-green-400">{report.contractName ?? "Unnamed contract"}</Link><p className="mt-1 break-all font-mono text-xs text-text-low">{report.reportHash ? `${report.reportHash.slice(0, 14)}…` : report.id.slice(0, 8)}</p></td><td className="p-3 text-text-mid">{report.sourceKind ?? "unknown"}{report.sourceRef ? <p className="max-w-56 truncate text-xs text-text-low">{report.sourceRef}</p> : null}</td><td className="p-3"><StatusBadge status={report.status} progress={report.progress} stage={report.currentStage} /></td><td className="p-3 font-mono text-text-hi">{formatUsd(readTotal(report.totals, "annualSavingsUsd"))}</td><td className="p-3 text-text-mid">{new Date(report.createdAt).toLocaleString()}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
        <h2 className="text-xl font-semibold text-text-hi">Top persisted optimization opportunities</h2>
        <p className="mt-1 text-sm text-text-mid">Rows are ranked from stored `gas_optimizations`; labels preserve whether deltas were measured or estimated.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {snapshot.topOptimizations.map((item) => <article key={item.id} className="rounded-card border border-border-subtle bg-terminal p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-text-hi">{item.title}</h3><span className="rounded-pill border border-border-subtle bg-surface-2 px-2 py-1 text-xs text-text-low">{item.measurementLabel ?? "unlabeled"}</span></div><p className="mt-2 text-sm text-text-mid">{item.contractName ?? "Unknown contract"} · {item.location ?? "location unavailable"}</p><div className="mt-3 grid grid-cols-2 gap-2"><Mini label="L2 gas" value={formatNumber(item.measuredL2Delta ?? item.estL2Delta)} /><Mini label="Annual" value={formatUsd(item.annualSavingsUsd)} /></div><Link href={`/app/gas/${item.gasReportId}`} className="mt-3 inline-flex text-sm font-semibold text-green-400 hover:text-green-300">Open report →</Link></article>)}
          {!snapshot.topOptimizations.length ? <div className="rounded-card border border-border-subtle bg-terminal p-5 text-sm text-text-mid lg:col-span-3">No completed optimization rows yet. Run a real gas report to populate this section.</div> : null}
        </div>
      </section>
    </>}
  </div>;
}

function EmptyTelemetry() {
  return <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
    <h2 className="text-xl font-semibold text-text-hi">No gas telemetry yet</h2>
    <p className="mt-2 text-sm leading-6 text-text-mid">Cost Guard is intentionally blank until real gas reports exist. Run a scan or gas optimizer job to populate this dashboard from the database.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <Link href="/app/audit/new" className="inline-flex items-center gap-2 rounded-control bg-green-400 px-4 py-2 font-semibold text-canvas">Run a Scan <ArrowRight size={16}/></Link>
      <Link href="/app/gas" className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-terminal px-4 py-2 text-text-mid hover:text-green-400">Open Gas Optimizer</Link>
    </div>
  </section>;
}

function Metric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return <section className="rounded-card border border-border-subtle bg-surface-1 p-4"><div className="flex items-center gap-2 text-green-400">{icon}<p className="text-xs uppercase tracking-[0.12em]">{label}</p></div><p className="mt-3 font-mono text-2xl font-semibold text-text-hi">{value}</p><p className="mt-1 text-xs text-text-low">{note}</p></section>;
}

function StatusBadge({ status, progress, stage }: { status: string; progress: number | null; stage: string | null }) {
  const done = status === "done";
  const failed = status === "failed";
  return <span className={done ? "inline-flex items-center gap-1.5 rounded-pill border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success" : failed ? "inline-flex items-center gap-1.5 rounded-pill border border-danger/30 bg-danger/10 px-2.5 py-1 text-xs text-danger" : "inline-flex items-center gap-1.5 rounded-pill border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs text-warning"}>{done ? <CheckCircle2 size={13}/> : <Clock size={13}/>} {status}{!done && !failed ? ` · ${progress ?? 0}%` : ""}{stage ? ` · ${stage}` : ""}</span>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-control border border-border-subtle bg-surface-1 p-2"><p className="text-xs uppercase tracking-[0.12em] text-text-low">{label}</p><p className="mt-1 font-mono text-sm text-text-hi">{value}</p></div>;
}

function readTotal(totals: Record<string, unknown> | null, key: string) {
  return totals && key in totals ? totals[key] as string | number | null : null;
}

function formatNumber(value: unknown) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num === 0) return "0";
  return Math.round(num).toLocaleString();
}

function formatUsd(value: unknown) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num === 0) return "$0";
  return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatWei(value: unknown) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num === 0) return "0 wei";
  if (num >= 1e18) return `${(num / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 })} MNT`;
  if (num >= 1e9) return `${(num / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })} gwei`;
  return `${Math.round(num).toLocaleString()} wei`;
}
