import { AlertTriangle } from "lucide-react";
import { SeverityPill } from "./SeverityPill";
import type { Severity } from "./severity";
export function FindingCard({ severity = "high" as Severity, title = "External call before state update", location = "VaultV2.sol:42", status = "open" }) {
  return <article className="rounded-card border border-border-subtle bg-surface-1 p-4"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 text-warning" size={18}/><div><h3 className="font-semibold text-text-hi">{title}</h3><p className="mt-1 font-mono text-xs text-text-low">{location}</p></div></div><SeverityPill severity={severity} size="sm" /></div><div className="mt-4 flex items-center justify-between text-xs text-text-low"><span className="rounded-pill bg-surface-2 px-2 py-1">{status}</span><time>2m ago</time></div></article>;
}
