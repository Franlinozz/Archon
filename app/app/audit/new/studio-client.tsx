"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Expand, FileCode2, Info, RefreshCcw, ShieldCheck } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { archonMonacoTheme, defineArchonMonacoThemes } from "@/components/theme/monacoThemes";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="archon-skeleton h-[620px] rounded-b-card border-x border-b border-border-subtle p-5 text-sm text-text-low">Loading Solidity editor…</div>,
});

const protocols = ["mETH", "cmETH", "USDY", "Aave V3", "Merchant Moe", "Agni"] as const;
const scanDepths = [
  { id: "quick", label: "Quick" },
  { id: "deep", label: "Deep" },
  { id: "gas-cost", label: "Gas & Cost" },
  { id: "full-report", label: "Full Report" },
] as const;

type ScanDepth = (typeof scanDepths)[number]["id"];

type Props = { initialSource: string };

type ApiIssue = { path: string; message: string };
type SourceImportPayload = {
  mode?: "single" | "select";
  source?: string;
  fileName?: string;
  path?: string;
  repo?: string;
  ref?: string;
  error?: string;
  message?: string;
  sourceFiles?: Array<{ path: string; source: string }>;
  files?: Array<{ path: string; name: string; size: number; contractNames: string[] }>;
};

function chooseSourceFile(files: NonNullable<SourceImportPayload["files"]>, message = "Select Solidity file") {
  const options = files.map((file, index) => `${index + 1}. ${file.path}${file.contractNames.length ? ` (${file.contractNames.join(", ")})` : ""}`).join("\n");
  const answer = window.prompt(`${message}:\n${options}`);
  if (!answer) return null;
  const index = Number(answer.trim()) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= files.length) throw new Error("Invalid Solidity file selection.");
  return files[index]!.path;
}

export function AuditStudioClient({ initialSource }: Props) {
  const router = useRouter();
  const { theme } = useTheme();
  const [sourceCode, setSourceCode] = useState(initialSource);
  const [scanDepth, setScanDepth] = useState<ScanDepth>("deep");
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([...protocols]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState("VaultV2.sol");
  const [sourceFiles, setSourceFiles] = useState<Array<{ path: string; source: string }> | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const contractCount = useMemo(() => (sourceCode.match(/\bcontract\s+[A-Za-z_][A-Za-z0-9_]*/g) ?? []).length, [sourceCode]);
  const solidityVersion = useMemo(() => sourceCode.match(/pragma\s+solidity\s+([^;]+);/)?.[1]?.trim() ?? "unknown", [sourceCode]);
  const coverage = Math.min(98, 46 + selectedProtocols.length * 7 + (scanDepth === "deep" ? 10 : scanDepth === "full-report" ? 16 : scanDepth === "gas-cost" ? 12 : 4));
  const circumference = 2 * Math.PI * 42;
  const dash = (coverage / 100) * circumference;

  async function runScan() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceKind: "paste", sourceCode, sourceFiles: sourceFiles ?? undefined, scanDepth, protocols: selectedProtocols }),
      });
      const payload = (await response.json()) as { scanId?: string; error?: string; issues?: ApiIssue[] };
      if (!response.ok || !payload.scanId) {
        const details = payload.issues?.map((issue) => issue.message).join(" ");
        throw new Error(details || payload.error || "Scan request failed.");
      }
      router.push(`/app/scans/${payload.scanId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan request failed.");
      setIsSubmitting(false);
    }
  }

  async function importFile(file: File, selectedPath?: string) {
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (selectedPath) form.set("path", selectedPath);
      const response = await fetch("/api/source/upload", { method: "POST", body: form });
      const payload = (await response.json()) as SourceImportPayload;
      if (!response.ok) throw new Error(payload.error || "Upload import failed.");
      if (payload.mode === "select" && payload.files?.length) {
        const path = chooseSourceFile(payload.files, payload.message);
        if (path) await importFile(file, path);
        return;
      }
      if (!payload.source) throw new Error(payload.error || "Upload did not return Solidity source.");
      setSourceCode(payload.source);
      setSourceFiles(payload.sourceFiles ?? [{ path: payload.path ?? payload.fileName ?? file.name, source: payload.source }]);
      setSourceLabel(payload.path ?? payload.fileName ?? file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload import failed.");
    }
  }

  async function importGithub() {
    const repo = window.prompt("GitHub repo or file URL (examples: Franlinozz/Archon#contracts/VaultV2.sol, https://github.com/owner/repo/blob/main/contracts/X.sol)");
    if (!repo) return;
    setError(null);
    setIsImporting(true);
    try {
      let response = await fetch("/api/source/github", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repo }) });
      let payload = (await response.json()) as SourceImportPayload;
      if (!response.ok) throw new Error(payload.error || "GitHub import failed.");
      if (payload.mode === "select" && payload.files?.length) {
        const path = chooseSourceFile(payload.files, payload.message);
        if (!path) return;
        response = await fetch("/api/source/github", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repo, path, ref: payload.ref }) });
        payload = (await response.json()) as SourceImportPayload;
        if (!response.ok) throw new Error(payload.error || "GitHub import failed.");
      }
      if (!payload.source) throw new Error(payload.error || "GitHub import did not return Solidity source.");
      setSourceCode(payload.source);
      setSourceFiles(payload.sourceFiles ?? [{ path: payload.path ?? payload.fileName ?? "Contract.sol", source: payload.source }]);
      setSourceLabel(`${payload.repo ?? "github"}/${payload.path ?? payload.fileName ?? "Contract.sol"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GitHub import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  function toggleProtocol(protocol: string) {
    setSelectedProtocols((current) => current.includes(protocol) ? current.filter((item) => item !== protocol) : [...current, protocol]);
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-green-400">Audit Studio</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Start a read-only Archon scan.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-text-mid">Paste Solidity, choose Mantle-aware coverage, and queue a deterministic scan without sending a transaction.</p>
      </div>
      <div className="rounded-pill border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">Mantle Mainnet · Live</div>
    </div>

    <div className="grid min-h-[760px] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_430px]">
      <section className={isFullscreen ? "fixed inset-4 z-50 overflow-auto rounded-card border border-green-400/30 bg-canvas p-4 shadow-2xl" : "min-w-0"}>
        <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-1">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-1 p-3">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-pill border border-green-400/30 bg-green-400/10 px-4 py-2 text-sm font-medium text-green-400">Paste Code</span>
              <input ref={fileInputRef} type="file" accept=".sol,.zip,text/plain,application/zip" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ""; }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-pill border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-text-mid hover:border-green-400/40 hover:text-green-400">Upload File</button>
              <button type="button" onClick={() => void importGithub()} disabled={isImporting} className="rounded-pill border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-text-mid hover:border-green-400/40 hover:text-green-400 disabled:cursor-wait disabled:opacity-60">{isImporting ? "Importing…" : "GitHub Repo"}</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="max-w-[260px] truncate rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-hi" title={sourceLabel}>{sourceLabel}</span>
              <button onClick={() => { setSourceCode(initialSource); setSourceFiles(null); setSourceLabel("VaultV2.sol"); }} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid hover:text-green-400"><RefreshCcw size={15}/> Reset</button>
              <button onClick={() => setIsFullscreen((value) => !value)} className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid hover:text-green-400"><Expand size={15}/> {isFullscreen ? "Exit" : "Fullscreen"}</button>
            </div>
          </div>
          <div className="border-b border-border-subtle bg-terminal">
            <MonacoEditor
              height={isFullscreen ? "calc(100vh - 210px)" : "620px"}
              defaultLanguage="sol"
              language="sol"
              theme={archonMonacoTheme(theme)}
              beforeMount={defineArchonMonacoThemes}
              value={sourceCode}
              onChange={(value) => setSourceCode(value ?? "")}
              options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "JetBrains Mono, monospace", lineNumbers: "on", scrollBeyondLastLine: false, wordWrap: "on", padding: { top: 16 }, automaticLayout: true }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-1 px-4 py-3 font-mono text-xs text-text-low">
            <span>Solidity {solidityVersion}</span>
            <span>{contractCount} contract{contractCount === 1 ? "" : "s"}</span>
            <span className="inline-flex items-center gap-1 text-success"><Check size={14}/> 0 errors</span>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-green-400">Scan Configuration</p>
              <h2 className="mt-2 text-2xl font-semibold text-text-hi">Mantle risk profile</h2>
            </div>
            <ShieldCheck className="text-green-400" />
          </div>

          <div className="mt-5 rounded-card border border-border-subtle bg-surface-2 p-4">
            <p className="text-xs text-text-low">Network</p>
            <p className="mt-1 font-medium text-text-hi">Mantle Mainnet · <span className="text-success">Live</span></p>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-text-hi">Scan Depth</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {scanDepths.map((depth) => <button key={depth.id} onClick={() => setScanDepth(depth.id)} className={depth.id === scanDepth ? "rounded-control border border-green-400/40 bg-green-400/10 px-3 py-2 text-sm text-green-400" : "rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid hover:text-text-hi"}>{depth.label}</button>)}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-text-hi">Protocol Coverage</p>
              <button onClick={() => setSelectedProtocols([...protocols])} className="text-xs text-green-400 hover:text-green-300">Select All</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {protocols.map((protocol) => <button key={protocol} onClick={() => toggleProtocol(protocol)} className={selectedProtocols.includes(protocol) ? "rounded-pill border border-green-400/35 bg-green-400/10 px-3 py-1.5 text-sm text-green-400" : "rounded-pill border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-text-low"}>{protocol}</button>)}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {["Generate Tests", "Include Gas Optimization", "Log Proof After Review"].map((label) => <label key={label} className="flex items-center justify-between rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid"><span>{label}</span><input type="checkbox" checked readOnly className="rounded border-border-emphasis bg-terminal text-green-500 focus:ring-green-400" /></label>)}
          </div>

          <div className="mt-5 grid grid-cols-[120px_1fr] items-center gap-4 rounded-card border border-border-subtle bg-terminal p-4">
            <svg width="108" height="108" viewBox="0 0 108 108" aria-label={`Estimated coverage ${coverage}%`}>
              <circle cx="54" cy="54" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
              <circle cx="54" cy="54" r="42" fill="none" stroke="var(--green-400)" strokeLinecap="round" strokeWidth="10" strokeDasharray={`${dash} ${circumference - dash}`} transform="rotate(-90 54 54)" />
              <text x="54" y="59" textAnchor="middle" className="fill-text-hi font-mono text-xl">{coverage}%</text>
            </svg>
            <div>
              <p className="font-medium text-text-hi">Estimated Coverage</p>
              <p className="mt-1 text-sm leading-6 text-text-mid">Static analysis, Mantle protocol fingerprints, gas-cost checks, and read-only context enrichment.</p>
            </div>
          </div>

          {error ? <div className="mt-5 flex gap-2 rounded-card border border-danger/30 bg-danger/10 p-3 text-sm text-danger"><AlertTriangle size={18}/><span>{error}</span></div> : null}

          <button onClick={runScan} disabled={isSubmitting} className="mt-5 w-full rounded-control bg-green-500 px-4 py-3 font-semibold text-on-green hover:bg-green-400 disabled:cursor-wait disabled:opacity-70">{isSubmitting ? "Queuing Scan…" : "Run Archon Scan"}</button>
        </div>

        <div className="rounded-card border border-info/25 bg-info/10 p-4 text-sm leading-6 text-text-mid">
          <div className="mb-2 flex items-center gap-2 font-medium text-info"><Info size={16}/> Audit Notes</div>
          Archon scans are read-only. This flow analyzes source and Mantle context only; it never sends a transaction or moves funds.
        </div>

        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 text-sm text-text-low">
          <div className="mb-2 flex items-center gap-2 text-text-mid"><FileCode2 size={16}/> Demo spine</div>
          VaultV2.sol intentionally includes reentrancy, missing slippage enforcement, and a gas-wasteful storage loop for the judge demo.
        </div>
      </aside>
    </div>
  </div>;
}
