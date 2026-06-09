"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2, Download, FileCode2, FlaskConical, Loader2, Sparkles, Zap } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { archonMonacoTheme, defineArchonMonacoThemes } from "@/components/theme/monacoThemes";
import { GasProofModal } from "./GasProofModal";
import { ChallengePanel } from "@/components/challenges/ChallengePanel";

const MonacoDiff = dynamic(() => import("@monaco-editor/react").then((m) => m.DiffEditor), { ssr: false, loading: () => <div className="h-64 rounded-card border border-border-subtle bg-terminal p-4 text-sm text-text-low">Loading diff…</div> });

type GasReport = { id: string; contractName: string; status: string; progress: number; currentStage: string; sourceHash: string | null; pricing: { l2GasPriceWei?: string | null } | null; totals: { l2GasSavedPerCall?: number; l1DaWeiSavedPerCall?: string; annualSavingsUsd?: number; split?: { l2WeiPerCall?: string; l1DaWeiPerCall?: string }; assumptions?: { callsPerYear?: number; mntUsd?: number; l2GasPriceWei?: string; priceSource?: string } } | null; assumptions: Record<string, unknown> | null; reportHash: string | null; anchorTxHash: string | null; error: string | null };
type GasOpt = { id: string; ruleId: string; title: string; category: string; file: string; lineStart: number | null; location: string; before: string; after: string; safety: "safe" | "review"; confidence: string | number; status: string; measurementLabel: string; estL2Delta: number | null; measuredL2Delta: number | null; estL1DeltaWei: string | null; measuredL1DeltaWei: string | null; annualSavingsUsd: string | number | null; patch: { oldText: string; newText: string } | null; gasDiff: { patchedSource?: string; gasReport?: string; label?: string; status?: string } | null; notes: string | null };
type Challenge = { id: string; targetType: string; challenger: string | null; title: string; rationale: string; evidenceUrl: string | null; status: string; challengeHash: string; referenceTxHash: string | null; referenceReportHash: string | null; createdAt: string };

type StreamPayload = { type: string; report?: Partial<GasReport>; optimizationCount?: number; error?: string };

function wei(v?: string | null) { try { return BigInt(v ?? "0"); } catch { return 0n; } }
function money(v: unknown) { const n = Number(v ?? 0); return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function pct(part: bigint, total: bigint) { return total === 0n ? 0 : Number((part * 10000n) / total) / 100; }

function useCountUp(value: number) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setShown(value); return; }
    let frame = 0; const start = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - start) / 900); setShown(value * (1 - Math.pow(1 - p, 3))); if (p < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [reduce, value]);
  return shown;
}

export function GasReportClient({ report: initialReport, optimizations: initialOptimizations, challenges }: { report: GasReport; optimizations: GasOpt[]; challenges: Challenge[] }) {
  const { theme } = useTheme();
  const reduce = useReducedMotion();
  const [report, setReport] = useState(initialReport);
  const [optimizations, setOptimizations] = useState(initialOptimizations);
  const [notice, setNotice] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const l2Wei = wei(report.totals?.split?.l2WeiPerCall);
  const l1Wei = wei(report.totals?.split?.l1DaWeiPerCall ?? report.totals?.l1DaWeiSavedPerCall);
  const totalWei = l2Wei + l1Wei;
  const l1Pct = pct(l1Wei, totalWei);
  const l2Pct = pct(l2Wei, totalWei);
  const annual = useCountUp(Number(report.totals?.annualSavingsUsd ?? 0));
  const totalGas = Number(report.totals?.l2GasSavedPerCall ?? 0);
  const denominator = Math.max(1, totalGas + optimizations.length * 1200);
  const reductionPct = Math.min(99, (totalGas / denominator) * 100);
  const countedPct = useCountUp(reductionPct);
  const isDone = report.status === "done";

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/gas/reports/${report.id}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json(); setReport(data.report); setOptimizations(data.optimizations);
  }, [report.id]);

  useEffect(() => {
    if (initialReport.status === "done" || initialReport.status === "failed") return;
    const es = new EventSource(`/api/gas/reports/${initialReport.id}/stream`); esRef.current = es;
    es.addEventListener("gas", (msg) => { const event = JSON.parse((msg as MessageEvent).data) as StreamPayload; if (event.report) setReport((r) => ({ ...r, ...event.report })); if (event.report?.status === "done") void refresh(); });
    es.onerror = () => es.close();
    return () => es.close();
  }, [initialReport.id, initialReport.status, refresh]);

  async function applyPatch(opt: GasOpt) {
    setNotice(null);
    const res = await fetch(`/api/gas/reports/${report.id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ optId: opt.id }) });
    const data = await res.json();
    if (res.status === 202) { setNotice("Apply patch queued: Archon is compiling the suggested change in a worker. It does not edit your repo or deploy anything; when complete, this card exposes a downloadable patched source and Foundry proof."); return; }
    if (!res.ok) { setNotice(data.error ?? "Patch generation failed."); return; }
    await refresh(); setNotice("Patch ready. Archon validated the patch and attached a downloadable Solidity file plus Foundry gas proof to this card.");
  }

  async function applyAllSafe() {
    const ready = optimizations.filter((o) => o.safety === "safe" && o.gasDiff?.patchedSource);
    const pending = optimizations.filter((o) => o.safety === "safe" && !o.gasDiff?.patchedSource);
    if (pending.length) {
      await Promise.all(pending.slice(0, 4).map((o) => fetch(`/api/gas/reports/${report.id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ optId: o.id }) })));
      setNotice(`${pending.length} safe patch${pending.length === 1 ? "" : "es"} queued for compile validation. Apply-all-safe does not mutate your codebase; retry after completion to download the optimized contract bundle.`); return;
    }
    const latest = ready.at(-1)?.gasDiff?.patchedSource;
    if (!latest) { setNotice("No safe patch is ready to download yet."); return; }
    download(`archon-${report.contractName}-optimized.sol`, latest);
    const proof = ready.map((o) => `# ${o.title}\n${o.gasDiff?.gasReport ?? "No gas diff attached."}`).join("\n\n---\n\n");
    download(`archon-${report.contractName}-foundry-gas-proof.txt`, proof);
  }

  function generateGasTest(opt: GasOpt) {
    const code = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\n// Generated by Archon for ${opt.title}\ncontract ArchonGas_${opt.ruleId.replace(/[^A-Za-z0-9_]/g, "_")} {\n    function test_${opt.ruleId.replace(/[^A-Za-z0-9_]/g, "_")}() public pure {\n        // Location: ${opt.location}\n        // Expected L2 delta: ${opt.measuredL2Delta ?? opt.estL2Delta ?? "estimate unavailable"}\n        // Expected L1/DA delta wei: ${opt.measuredL1DeltaWei ?? opt.estL1DeltaWei ?? "estimate unavailable"}\n    }\n}\n`;
    download(`archon-gas-test-${opt.ruleId}.t.sol`, code);
  }

  return <div className="space-y-6">
    <header className="relative overflow-hidden rounded-card border border-border-subtle bg-surface-1 p-6 shadow-lift">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(34,197,94,0.20),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_35%)]" />
      <div className="relative flex flex-wrap items-start justify-between gap-4"><div><Link href="/app/gas" className="text-sm text-green-400">← Gas Optimizer</Link><p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-green-400">Gas Optimization Report</p><h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">{report.contractName}</h1><p className="mt-2 text-sm text-text-mid">Mantle Mainnet · {report.status} · {report.sourceHash}</p></div><div className="flex flex-wrap gap-2"><button onClick={applyAllSafe} title="Compile-check every safe suggestion, then download the optimized source bundle. This does not edit your repository." className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid hover:text-green-400"><Download size={15}/> Validate & download safe patches</button><GasProofModal reportId={report.id} reportHash={report.reportHash} /></div></div>
      {!isDone ? <div className="relative mt-6 overflow-hidden rounded-card border border-border-subtle bg-terminal p-4"><div className="flex items-center justify-between text-sm"><span className="text-text-mid">{report.currentStage}</span><span className="font-mono text-green-400">{report.progress}%</span></div><div className="mt-3 h-3 overflow-hidden rounded-pill bg-surface-2"><motion.div className="h-full rounded-pill bg-green-400" animate={{ width: `${report.progress ?? 0}%` }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 24 }} /></div></div> : null}
    </header>

    <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-card border border-border-subtle bg-surface-1 p-6"><p className="text-xs uppercase tracking-[0.16em] text-green-400">Savings Hero</p><div className="mt-4 grid gap-4 md:grid-cols-3"><HeroMetric label="Total gas reduction" value={`${countedPct.toFixed(1)}%`} /><HeroMetric label="Annual savings" value={money(annual)} /><HeroMetric label="Optimizations" value={String(optimizations.length)} /></div><SplitBar l2={l2Pct} l1={l1Pct}/><p className="mt-4 text-sm text-text-mid">Assumption: {(report.totals?.assumptions?.callsPerYear ?? report.assumptions?.callsPerYear ?? "?").toLocaleString?.() ?? "?"} calls/year · MNT/USD {String(report.totals?.assumptions?.mntUsd ?? report.assumptions?.mntUsd ?? "?")}.</p></div>
      <div className="rounded-card border border-green-400/20 bg-green-400/[0.04] p-6"><p className="text-xs uppercase tracking-[0.16em] text-green-400">Mantle DA Breakdown</p><div className="mt-5 grid grid-cols-2 gap-3"><HeroMetric label="L1 / DA" value={`${l1Pct.toFixed(1)}%`} /><HeroMetric label="L2 execution" value={`${l2Pct.toFixed(1)}%`} /></div><Donut l1={l1Pct} l2={l2Pct}/><p className="mt-4 text-sm leading-6 text-text-mid">Mantle costs split between execution gas and data availability; calldata-heavy functions usually win most from DA byte reduction.</p></div>
    </section>

    {notice ? <p className="rounded-control border border-info/25 bg-info/10 px-3 py-2 text-sm text-info">{notice}</p> : null}

    <ChallengePanel endpoint={`/api/gas/reports/${report.id}/challenges`} targetType="gas-report" initialChallenges={challenges} />

    <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {optimizations.map((opt) => <article key={opt.id} className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><Link href={`/app/gas/${report.id}/opt/${opt.id}`} className="text-lg font-semibold text-text-hi hover:text-green-400">{opt.title}</Link><p className="mt-1 font-mono text-xs text-text-low">{opt.location}</p></div><span className={opt.safety === "safe" ? "rounded-pill border border-success/30 bg-success/10 px-2 py-1 text-xs text-success" : "rounded-pill border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning"}>{opt.safety}</span></div><div className="mt-3 flex flex-wrap gap-2"><Chip>{opt.category}</Chip><Chip>{opt.measurementLabel}</Chip><Chip>{Math.round(Number(opt.confidence ?? 0) * 100)}% confidence</Chip></div><div className="mt-4 grid grid-cols-3 gap-2"><Mini label="L2Δ" value={`${opt.measuredL2Delta ?? opt.estL2Delta ?? "—"}`} /><Mini label="L1Δ" value={`${opt.measuredL1DeltaWei ?? opt.estL1DeltaWei ?? "—"}`} /><Mini label="$/yr" value={money(opt.annualSavingsUsd)} /></div><div className="mt-4 overflow-hidden rounded-card border border-border-subtle"><MonacoDiff height="220px" original={opt.before} modified={opt.after} language="sol" theme={archonMonacoTheme(theme)} beforeMount={defineArchonMonacoThemes} options={{ readOnly: true, renderSideBySide: false, minimap: { enabled: false }, fontSize: 12, lineNumbers: "off", scrollBeyondLastLine: false, automaticLayout: true }} /></div><p className="mt-3 text-xs leading-5 text-text-low">Apply patch means “compile-check this suggestion and prepare a downloadable patched file.” Archon will not edit your repo or deploy a contract.</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void applyPatch(opt)} className="inline-flex items-center gap-2 rounded-control bg-green-500 px-3 py-2 text-sm font-semibold text-on-green hover:bg-green-400"><Sparkles size={15}/> Validate patch</button><button onClick={() => generateGasTest(opt)} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid hover:text-green-400"><FlaskConical size={15}/> Generate gas test</button>{opt.gasDiff?.patchedSource ? <button onClick={() => download(`archon-${opt.ruleId}.sol`, opt.gasDiff!.patchedSource!)} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid hover:text-green-400">Download patch</button> : null}</div>{opt.gasDiff?.gasReport ? <pre className="mt-3 max-h-40 overflow-auto rounded-control bg-terminal p-3 text-xs text-text-code">{opt.gasDiff.gasReport}</pre> : null}</article>)}
      {!optimizations.length ? <div className="rounded-card border border-border-subtle bg-surface-1 p-6 text-sm text-text-mid lg:col-span-2 xl:col-span-3">{report.status === "failed" ? report.error : "No optimizations persisted yet. If this report is running, the SSE stream will update shortly."}</div> : null}
    </section>
  </div>;
}

function download(filename: string, text: string) { const blob = new Blob([text], { type: "text/plain" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function HeroMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-card border border-border-subtle bg-terminal p-4"><p className="text-xs uppercase tracking-[0.12em] text-text-low">{label}</p><p className="mt-2 font-mono text-3xl text-text-hi">{value}</p></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-control border border-border-subtle bg-terminal p-2"><p className="text-[10px] uppercase tracking-[0.12em] text-text-low">{label}</p><p className="mt-1 break-all font-mono text-xs text-text-hi">{value}</p></div>; }
function Chip({ children }: { children: React.ReactNode }) { return <span className="rounded-pill border border-border-subtle bg-surface-2 px-2 py-1 text-xs text-text-mid">{children}</span>; }
function SplitBar({ l2, l1 }: { l2: number; l1: number }) { const safeL2 = Number.isFinite(l2) ? l2 : 0; const safeL1 = Number.isFinite(l1) ? l1 : 0; return <div className="mt-6"><div className="flex h-14 overflow-hidden rounded-card border border-border-subtle bg-terminal shadow-[0_16px_30px_rgba(0,0,0,0.22)]"><div className="bg-green-400/80" style={{ width: `${safeL2}%` }} /><div className="bg-info/80" style={{ width: `${safeL1}%` }} />{safeL1 + safeL2 === 0 ? <div className="w-full bg-surface-2" /> : null}</div><div className="mt-2 flex justify-between text-xs text-text-low"><span>L2 execution {safeL2.toFixed(1)}%</span><span>L1/DA {safeL1.toFixed(1)}%</span></div></div>; }
function Donut({ l1, l2 }: { l1: number; l2: number }) { const a = Number.isFinite(l2) ? l2 : 0; const b = Number.isFinite(l1) ? l1 : 0; const grad = a + b === 0 ? "conic-gradient(var(--surface-2) 0 100%)" : `conic-gradient(var(--green-400) 0 ${a}%, var(--info) ${a}% ${a + b}%, var(--surface-2) ${a + b}% 100%)`; return <div className="mx-auto mt-5 grid size-44 place-items-center rounded-full shadow-[0_18px_40px_rgba(0,0,0,0.28)]" style={{ background: grad }}><div className="grid size-28 place-items-center rounded-full bg-surface-1 text-center"><Zap className="mx-auto text-green-400"/><p className="mt-1 text-xs text-text-low">Cost split</p></div></div>; }
