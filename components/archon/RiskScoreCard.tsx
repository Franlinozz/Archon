import { SeverityPill } from "./SeverityPill";
import type { Severity } from "./severity";
export function RiskScoreCard({ score = 72, severity = "high" as Severity }) {
  return <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><div className="text-xs uppercase tracking-[0.12em] text-green-400">Risk score</div><div className="mt-4 flex items-end gap-3"><span className="font-mono text-5xl text-text-hi">{score}</span><span className="mb-2 font-mono text-text-low">/100</span><SeverityPill severity={severity} /></div><div className="mt-5 grid grid-cols-5 gap-1">{["danger","high","warning","success","info"].map((c,i)=><div key={c} className={`h-2 rounded-pill ${i<4?"bg-green-400":"bg-surface-3"}`} />)}</div><a className="mt-4 inline-block text-sm text-green-400" href="#risk-formula">How is this calculated?</a></section>;
}
