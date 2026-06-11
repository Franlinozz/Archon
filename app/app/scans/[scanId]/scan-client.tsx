"use client";

import Link from "next/link";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Activity, AlertTriangle, Clock, Radio, RefreshCw, ShieldCheck } from "lucide-react";
import { FindingCard, LogTerminal, SeverityPill, Stepper, type StepState } from "@/components/archon";
import type { Severity } from "@/components/archon/severity";
import { progressSpring } from "@/lib/motion";

const stages = ["Code Parse", "Static Analysis", "Mantle Context Fetch", "Protocol Rule Engine", "AI Reasoning", "Test Generation", "Report Assembly"] as const;
const severities: Array<Severity | "all"> = ["all", "critical", "high", "medium", "low", "info"];

type Scan = {
  id: string;
  sourceKind: string;
  sourceRef: string | null;
  network: string;
  scanDepth: string;
  protocols: string[];
  status: string;
  progress: number;
  currentStage: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  contractName?: string;
};

type Finding = {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  file: string;
  lineStart: number | null;
  lineEnd: number | null;
  summary: string;
  status: string;
};

type LogLine = { id?: string; createdAt?: string; level: string; message: string };
type Report = { id: string; contractName: string; riskScore: number; severityCounts: Record<string, number>; reportHash: string; createdAt: string } | null;
type ScanPayload = { scan: Scan; findings: Finding[]; logs: LogLine[]; report: Report };
type StreamEvent = { type: string; scanId: string; stage?: string; progress?: number; status?: string; finding?: Finding; level?: string; message?: string; at?: string; reportId?: string; error?: string };

function stageState(stage: string, currentStage: string, status: string): StepState {
  if (status === "failed" && stage === currentStage) return "failed";
  if (status === "done") return "completed";
  const currentIndex = stages.indexOf(currentStage as never);
  const index = stages.indexOf(stage as never);
  if (currentIndex === -1) return index === 0 ? "active" : "queued";
  if (index < currentIndex) return "completed";
  if (index === currentIndex) return "active";
  return "queued";
}

function displayNetwork(network: string) {
  return network === "mantle-mainnet" ? "Mantle Mainnet · Live" : network;
}

function reducedModeFromLogs(logs: LogLine[]) {
  const warning = logs.find((line) => /External imports could not be resolved|reduced mode|Slither skipped/i.test(line.message));
  return warning?.message ?? null;
}

export function LiveScanClient({ scanId }: { scanId: string }) {
  const reduceMotion = useReducedMotion();
  const [scan, setScan] = useState<Scan | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [report, setReport] = useState<Report>(null);
  const [filter, setFilter] = useState<Severity | "all">("all");
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchTruth = useCallback(async () => {
    const response = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load scan state");
    const payload = await response.json() as ScanPayload;
    setScan(payload.scan);
    setFindings(payload.findings);
    setLogs(payload.logs);
    setReport(payload.report);
  }, [scanId]);

  const connect = useCallback(async () => {
    await fetchTruth();
    eventSourceRef.current?.close();
    const es = new EventSource(`/api/scans/${scanId}/stream`);
    eventSourceRef.current = es;
    es.onopen = () => setConnected(true);
    es.addEventListener("scan", (message) => {
      const event = JSON.parse((message as MessageEvent).data) as StreamEvent;
      if (event.type === "stage") {
        setScan((current) => current ? { ...current, currentStage: event.stage ?? current.currentStage, progress: event.progress ?? current.progress, status: event.status ?? current.status } : current);
      }
      if (event.type === "finding" && event.finding) {
        setFindings((current) => current.some((finding) => finding.id === event.finding!.id) ? current : [...current, event.finding!]);
      }
      if (event.type === "log") {
        setLogs((current) => [...current, { createdAt: event.at, level: event.level ?? "INFO", message: event.message ?? "" }]);
      }
      if (event.type === "done") {
        setScan((current) => current ? { ...current, status: "done", progress: 100, currentStage: "Done" } : current);
        void fetchTruth();
      }
      if (event.type === "failed") {
        setScan((current) => current ? { ...current, status: "failed", error: event.error ?? current.error } : current);
      }
    });
    es.onerror = () => {
      setConnected(false);
      es.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => void connect(), 2500);
    };
  }, [fetchTruth, scanId]);

  useEffect(() => {
    void connect();
    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const visibleFindings = useMemo(() => filter === "all" ? findings : findings.filter((finding) => finding.severity === filter), [filter, findings]);
  const stepperSteps = stages.map((label) => ({ label, state: stageState(label, scan?.currentStage ?? "Code Parse", scan?.status ?? "queued") }));
  const counts = findings.reduce<Record<string, number>>((acc, finding) => ({ ...acc, [finding.severity]: (acc[finding.severity] ?? 0) + 1 }), {});

  if (!scan) return <div className="rounded-card border border-border-subtle bg-surface-1 p-8 text-text-mid">Loading live scan…</div>;
  const isRunning = scan.status !== "done" && scan.status !== "failed";
  const reducedMode = reducedModeFromLogs(logs);

  return <div className="space-y-6">
    <header className="rounded-card border border-border-subtle bg-surface-1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-green-400">Live Scan Progress</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-text-hi">{report?.contractName ?? scan.contractName ?? "Contract"} audit run</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-mid">Seven-stage read-only analysis running against {displayNetwork(scan.network)}.</p>
        </div>
        <div className="flex items-center gap-2 rounded-pill border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"><span className="size-2 rounded-full bg-success"/> {connected ? "Live stream" : "Reconnecting"}</div>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-5">
        <InfoCard icon={<ShieldCheck size={18}/>} label="Network" value={displayNetwork(scan.network)} />
        <InfoCard icon={<Activity size={18}/>} label="Status" value={scan.status} />
        <InfoCard icon={<Radio size={18}/>} label="Scan ID" value={scan.id} mono />
        <InfoCard icon={<Clock size={18}/>} label="Started" value={scan.startedAt ? new Date(scan.startedAt).toLocaleString() : "Queued"} />
        <InfoCard icon={<RefreshCw size={18}/>} label="Scan Type" value={scan.scanDepth} />
      </div>
      {reducedMode ? <details className="mt-4 rounded-card border border-warning/30 bg-warning/10 p-3 text-sm text-warning" open>
        <summary className="cursor-pointer font-semibold">External imports could not be resolved; static analysis ran in reduced mode.</summary>
        <p className="mt-2 leading-6 text-text-mid">{reducedMode}</p>
      </details> : null}
      {scan.error ? <div className="mt-4 flex gap-2 rounded-card border border-danger/30 bg-danger/10 p-3 text-sm text-danger"><AlertTriangle size={18}/>{scan.error}</div> : null}
    </header>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
      <section className="space-y-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-5">
          <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold text-text-hi">Overall Progress</h2><span className="font-mono text-sm text-green-400">{scan.progress}%</span></div>
          <div className="relative mt-4 h-3 overflow-hidden rounded-pill bg-surface-2">
            <motion.div className="h-full w-full origin-left rounded-pill bg-green-400" style={{ transformOrigin: "left" }} animate={{ scaleX: Math.max(0, Math.min(1, (scan.progress ?? 0) / 100)) }} transition={reduceMotion ? { duration: 0 } : progressSpring} />
            {isRunning && !reduceMotion ? <span className="archon-sweep pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-pill" style={{ width: `${scan.progress}%` }} /> : null}
          </div>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-5">
          <h2 className="mb-5 text-xl font-semibold text-text-hi">Pipeline</h2>
          <Stepper steps={stepperSteps} />
        </div>
        <LogTerminal lines={logs} />
      </section>

      <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-semibold text-text-hi">Streaming Findings</h2><p className="mt-1 text-sm text-text-low">{findings.length} persisted findings · keyed by finding.id</p></div>
          <div className="flex items-center gap-2 text-sm text-success"><span className="size-2 animate-pulse rounded-full bg-success"/> Live</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {severities.map((severity) => <button key={severity} onClick={() => setFilter(severity)} className={filter === severity ? "rounded-pill border border-green-400/35 bg-green-400/10 px-3 py-1.5 text-sm text-green-400" : "rounded-pill border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-text-mid"}>{severity === "all" ? `All (${findings.length})` : `${severity} (${counts[severity] ?? 0})`}</button>)}
        </div>
        {report ? <div className="mt-4 flex items-center justify-between rounded-card border border-green-400/25 bg-green-400/10 p-4"><div><p className="text-sm text-text-mid">Report assembled</p><p className="font-mono text-2xl text-green-400">Risk {report.riskScore}/100</p></div><Link href={`/app/reports/${report.id}`} className="rounded-control bg-green-500 px-4 py-2 text-sm font-semibold text-on-green hover:bg-green-400">View Report</Link></div> : null}
        <div className="mt-5 max-h-[680px] space-y-3 overflow-auto pr-1">
          <AnimatePresence initial={false}>
            {visibleFindings.length ? [...visibleFindings].reverse().map((finding) => (
              <motion.div
                key={finding.id}
                layout={!reduceMotion}
                className="rounded-card"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, boxShadow: ["0 0 0 2px rgba(22,160,107,0.45)", "0 0 0 2px rgba(22,160,107,0)"] }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1], boxShadow: { duration: 1.2, ease: "easeOut" } }}
                style={{ willChange: "transform, opacity" }}
              >
                <FindingCard severity={finding.severity} title={finding.title} location={`${finding.file}:${finding.lineStart ?? "?"}`} status={finding.status} />
              </motion.div>
            )) : <div className="rounded-card border border-border-subtle bg-terminal p-5 text-sm text-text-low">No findings in this filter yet.</div>}
          </AnimatePresence>
        </div>
      </section>
    </div>
  </div>;
}

function InfoCard({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return <div className="rounded-card border border-border-subtle bg-surface-2 p-4">
    <div className="mb-3 text-green-400">{icon}</div>
    <p className="text-xs text-text-low">{label}</p>
    <p className={mono ? "break-all font-mono text-xs text-text-hi" : "text-sm font-medium text-text-hi"}>{value}</p>
  </div>;
}
