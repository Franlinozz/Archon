"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, DatabaseZap, Expand, Github, Network, RefreshCcw, Rocket, Upload } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { archonMonacoTheme, defineArchonMonacoThemes } from "@/components/theme/monacoThemes";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false, loading: () => <div className="archon-skeleton h-[620px] rounded-card border border-border-subtle p-5 text-sm text-text-low">Loading Solidity editor…</div> });

type SourceMode = "paste" | "address";

type ApiPayload = { gasReportId?: string; error?: string; issues?: Array<{ message: string }> };

export function GasOptimizerStudio({ initialSource }: { initialSource: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { theme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceCode, setSourceCode] = useState(initialSource);
  const [sourceMode, setSourceMode] = useState<SourceMode>("paste");
  const [sourceLabel, setSourceLabel] = useState("VaultV2.sol");
  const [address, setAddress] = useState("");
  const [callsPerYear, setCallsPerYear] = useState(100000);
  const [mntUsd, setMntUsd] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contractCount = useMemo(() => (sourceCode.match(/\bcontract\s+[A-Za-z_][A-Za-z0-9_]*/g) ?? []).length, [sourceCode]);
  const solidityVersion = useMemo(() => sourceCode.match(/pragma\s+solidity\s+([^;]+);/)?.[1]?.trim() ?? "unknown", [sourceCode]);
  const lineCount = sourceCode.split("\n").length;

  async function importFile(file: File) {
    setError(null);
    if (!file.name.endsWith(".sol")) { setError("Upload a Solidity .sol file."); return; }
    const text = await file.text();
    if (!text.includes("pragma solidity")) { setError("That file does not look like Solidity source."); return; }
    setSourceMode("paste"); setSourceCode(text); setSourceLabel(file.name);
  }

  async function importGithub() {
    const repo = window.prompt("GitHub repo/file URL (example: Franlinozz/Archon#contracts/VaultV2.sol)");
    if (!repo) return;
    setError(null); setIsImporting(true);
    try {
      const response = await fetch("/api/source/github", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repo }) });
      const payload = await response.json() as { source?: string; repo?: string; path?: string; fileName?: string; error?: string };
      if (!response.ok || !payload.source) throw new Error(payload.error ?? "GitHub import failed.");
      setSourceMode("paste"); setSourceCode(payload.source); setSourceLabel(`${payload.repo}/${payload.path ?? payload.fileName ?? "Contract.sol"}`);
    } catch (err) { setError(err instanceof Error ? err.message : "GitHub import failed."); }
    finally { setIsImporting(false); }
  }

  async function runGasOptimization() {
    setError(null); setIsSubmitting(true);
    try {
      const body = sourceMode === "address"
        ? { sourceKind: "address", sourceRef: address.trim(), callsPerYear, mntUsd }
        : { sourceKind: "paste", sourceCode, callsPerYear, mntUsd };
      const response = await fetch("/api/gas/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.gasReportId) throw new Error(payload.issues?.map((i) => i.message).join(" ") || payload.error || "Gas scan request failed.");
      router.push(`/app/gas/${payload.gasReportId}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Gas scan request failed."); setIsSubmitting(false); }
  }

  return <div className="space-y-6">
    <header className="relative overflow-hidden rounded-card border border-border-subtle bg-surface-1 p-6 shadow-lift">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,197,94,0.18),transparent_35%),radial-gradient(circle_at_85%_5%,rgba(255,255,255,0.08),transparent_30%)]" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-green-400">Mantle Gas Optimizer</p><h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Find the expensive bytes. Cut the real cost.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-text-mid">Run deterministic gas rules, receipt-calibrated DA pricing, queued Foundry patch checks, and ranked savings — locked to Mantle Mainnet.</p></div>
        <div className="rounded-pill border border-green-400/35 bg-green-400/10 px-4 py-2 text-sm text-green-400">Premium · Mantle only</div>
      </div>
    </header>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_420px]">
      <section className={isFullscreen ? "fixed inset-4 z-50 overflow-auto rounded-card border border-green-400/30 bg-canvas p-4 shadow-2xl" : "min-w-0"}>
        <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-1">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-1 p-3">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSourceMode("paste")} className={sourceMode === "paste" ? "rounded-pill border border-green-400/35 bg-green-400/10 px-4 py-2 text-sm text-green-400" : "rounded-pill border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-text-mid"}>Paste Code</button>
              <input ref={fileInputRef} type="file" accept=".sol,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.currentTarget.value = ""; }} />
              <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-pill border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-text-mid hover:text-green-400"><Upload size={15}/> Upload</button>
              <button onClick={() => void importGithub()} disabled={isImporting} className="inline-flex items-center gap-2 rounded-pill border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-text-mid hover:text-green-400 disabled:opacity-60"><Github size={15}/> {isImporting ? "Importing…" : "GitHub"}</button>
              <button onClick={() => setSourceMode("address")} className={sourceMode === "address" ? "rounded-pill border border-green-400/35 bg-green-400/10 px-4 py-2 text-sm text-green-400" : "rounded-pill border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-text-mid"}>Address</button>
            </div>
            <div className="flex items-center gap-2"><span className="max-w-[240px] truncate rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-hi" title={sourceLabel}>{sourceLabel}</span><button onClick={() => { setSourceCode(initialSource); setSourceLabel("VaultV2.sol"); setSourceMode("paste"); }} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid hover:text-green-400"><RefreshCcw size={15}/> Reset</button><button onClick={() => setIsFullscreen((v) => !v)} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid hover:text-green-400"><Expand size={15}/> {isFullscreen ? "Exit" : "Fullscreen"}</button></div>
          </div>
          {sourceMode === "address" ? <div className="min-h-[620px] bg-terminal p-6"><label className="block text-sm text-text-mid">Mantle contract address with verified source</label><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" className="mt-3 w-full rounded-control border-border-subtle bg-surface-1 font-mono text-text-hi"/><p className="mt-4 rounded-card border border-info/25 bg-info/10 p-4 text-sm leading-6 text-text-mid">Address mode fetches verified Solidity source from the Mantle explorer before queuing the gas worker. If the explorer has no verified source, the run fails clearly.</p></div> : <MonacoEditor height={isFullscreen ? "calc(100vh - 210px)" : "620px"} defaultLanguage="sol" language="sol" theme={archonMonacoTheme(theme)} beforeMount={defineArchonMonacoThemes} value={sourceCode} onChange={(v) => setSourceCode(v ?? "")} options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "JetBrains Mono, monospace", scrollBeyondLastLine: false, wordWrap: "on", automaticLayout: true }} />}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-1 px-4 py-3 font-mono text-xs text-text-low"><span>Solidity {sourceMode === "address" ? "verified-source" : solidityVersion}</span><span>{sourceMode === "address" ? "address mode" : `${contractCount} contract${contractCount === 1 ? "" : "s"}`}</span><span>{lineCount} lines</span><span className="inline-flex items-center gap-1 text-success"><Check size={14}/> Read-only</span></div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-[0.16em] text-green-400">Run Configuration</p><h2 className="mt-2 text-2xl font-semibold text-text-hi">Mantle economics</h2></div><DatabaseZap className="text-green-400"/></div>
          <div className="mt-5 grid gap-3"><Info icon={<Network size={16}/>} label="Network" value="Mantle Mainnet · locked"/><label className="rounded-card border border-border-subtle bg-surface-2 p-4 text-sm text-text-mid">Calls / year<input type="number" min={1} value={callsPerYear} onChange={(e) => setCallsPerYear(Number(e.target.value))} className="mt-2 w-full rounded-control border-border-subtle bg-terminal font-mono text-text-hi"/></label><label className="rounded-card border border-border-subtle bg-surface-2 p-4 text-sm text-text-mid">MNT / USD assumption<input type="number" min={0.0001} step="0.01" value={mntUsd} onChange={(e) => setMntUsd(Number(e.target.value))} className="mt-2 w-full rounded-control border-border-subtle bg-terminal font-mono text-text-hi"/></label></div>
          <div className="mt-5 rounded-card border border-green-400/20 bg-green-400/[0.04] p-4"><p className="text-sm font-medium text-text-hi">What runs</p><ul className="mt-2 space-y-1 text-sm text-text-mid"><li>• Deterministic optimization detectors</li><li>• Receipt-calibrated Mantle DA model</li><li>• Worker-queued Foundry patch harnesses</li><li>• Ranked L2-vs-L1 savings</li></ul></div>
          {error ? <div className="mt-5 flex gap-2 rounded-card border border-danger/30 bg-danger/10 p-3 text-sm text-danger"><AlertTriangle size={18}/><span>{error}</span></div> : null}
          <motion.button whileTap={reduce ? undefined : { scale: 0.98 }} onClick={runGasOptimization} disabled={isSubmitting} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-control bg-green-500 px-4 py-3 font-semibold text-on-green hover:bg-green-400 disabled:cursor-wait disabled:opacity-70"><Rocket size={18}/>{isSubmitting ? "Queuing Gas Optimization…" : "Run Gas Optimization"}</motion.button>
        </section>
      </aside>
    </div>
  </div>;
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-card border border-border-subtle bg-surface-2 p-4"><div className="mb-2 text-green-400">{icon}</div><p className="text-xs text-text-low">{label}</p><p className="text-sm font-medium text-text-hi">{value}</p></div>; }
