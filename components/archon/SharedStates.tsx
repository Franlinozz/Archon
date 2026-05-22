import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Loader2, Radio, Wallet, XCircle } from "lucide-react";
import { MainnetBadge } from "./MainnetBadge";

export function StateCard({ title, body, tone = "neutral", action }: { title: string; body: string; tone?: "neutral" | "success" | "warning" | "danger"; action?: React.ReactNode }) {
  const toneClass = tone === "success" ? "border-success/30 bg-success/10" : tone === "warning" ? "border-warning/30 bg-warning/10" : tone === "danger" ? "border-danger/30 bg-danger/10" : "border-border-subtle bg-surface-1";
  return <section className={`rounded-card border p-5 ${toneClass}`}><h3 className="text-lg font-semibold text-text-hi">{title}</h3><p className="mt-2 text-sm leading-6 text-text-mid">{body}</p>{action ? <div className="mt-4">{action}</div> : null}</section>;
}

export function WalletConnectModalState() { return <StateCard title="Wallet Connect" body="Connect a wallet only when you choose to log a report proof. Scans, context fetching, and report review remain read-only." action={<div className="flex items-center gap-3"><MainnetBadge/><span className="rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"><Wallet size={15} className="mr-2 inline"/> Connect wallet · modal state</span></div>} />; }
export function ProofPendingState() { return <StateCard tone="warning" title="Proof transaction pending" body="Archon is waiting for Mantle Mainnet confirmation. Keep this page open; no additional click is needed." action={<Loader2 className="animate-spin text-warning"/>}/>; }
export function ProofVerifiedState() { return <StateCard tone="success" title="Proof verified" body="The stored metadata hash matches the report hash and the ERC-8004 Reputation entry is present on Mantle Mainnet." action={<CheckCircle2 className="text-success"/>}/>; }
export function ScanFailedState() { return <StateCard tone="danger" title="Scan failed" body="The read-only scan stopped before completion. Review the log terminal, fix the source or address, then start a new scan." action={<XCircle className="text-danger"/>}/>; }
export function EmptyReportsState() { return <StateCard title="No reports yet" body="Run a read-only audit from Audit Studio. Completed reports will appear here with risk score, findings, generated tests, and proof status." action={<Link className="rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-canvas" href="/app/audit/new">Start audit</Link>}/>; }
export function EmptyFindingsState() { return <StateCard title="No findings for this filter" body="Try a different severity or search term. A clean table means no matching rows, not a security guarantee."/>; }
export function ContractNotVerifiedWarning() { return <StateCard tone="warning" title="Contract source not verified" body="Archon can read bytecode and balances, but line-level analysis needs verified Solidity source. Paste source manually or choose another address."/>; }
export function AiOutputValidationError() { return <StateCard tone="warning" title="AI output validation error" body="The model response did not match Archon's schema, so deterministic fallback copy is shown instead of trusting malformed output."/>; }
export function RpcRateLimitWarning() { return <StateCard tone="warning" title="RPC rate limit warning" body="Mantle RPC reads are being throttled. Archon will retry with backoff and cached context where available." action={<Radio className="text-warning"/>}/>; }
export function ExportReportModalState() { return <StateCard title="Export Report" body="Export includes report metadata, findings, generated tests, and proof references. It never includes private keys or wallet secrets." action={<span className="rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"><Download size={15} className="mr-2 inline"/> Export modal · Coming soon</span>}/>; }

export function SharedStatesShowcase() {
  return <div className="grid gap-4 md:grid-cols-2"><WalletConnectModalState/><ProofPendingState/><ProofVerifiedState/><ScanFailedState/><EmptyReportsState/><EmptyFindingsState/><ContractNotVerifiedWarning/><AiOutputValidationError/><RpcRateLimitWarning/><ExportReportModalState/></div>;
}
