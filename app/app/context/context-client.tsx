"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, FileJson, Loader2, ShieldCheck } from "lucide-react";

type ContextData = {
  address: string; explorerUrl: string; fetchedAt: string;
  summary: { verifiedSource: boolean; contractType: string; protocolMatches: number; ownerAdmin: string; lastUpdated: string };
  metadata: Record<string, unknown>;
  abiPreview: Array<{ type?: string; name?: string; stateMutability?: string; inputs?: Array<{ type: string; name?: string }> }>;
  dependencies: Array<{ label: string; address: string; note: string }>;
  protocolInteractions: Array<{ name: string; category: string; confidence: number; link: string }>;
  tokenExposure: Array<{ asset: string; exposure: string }>;
  riskNotes: string[];
  adminPermissions: string[];
  quickActions: { auditStudioUrl: string; proofStatus: string; exportStatus: string };
};

const defaultAddress = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

export function ContextClient() {
  const [address, setAddress] = useState(defaultAddress);
  const [debounced, setDebounced] = useState(defaultAddress);
  const [data, setData] = useState<ContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async (value: string) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/context?address=${encodeURIComponent(value.trim())}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Context fetch failed");
      setData(json);
    } catch (err) { setError(err instanceof Error ? err.message : "Context fetch failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const id = setTimeout(() => setDebounced(address), 350); return () => clearTimeout(id); }, [address]);
  useEffect(() => { void fetchContext(defaultAddress); }, [fetchContext]);

  const fullAbi = useMemo(() => data?.abiPreview?.map((item) => `${item.type ?? "item"} ${item.name ?? "(anonymous)"}(${item.inputs?.map((input) => `${input.type} ${input.name ?? ""}`).join(", ") ?? ""})`).join("\n") ?? "ABI unavailable", [data]);

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.14em] text-green-400">Contract Context Explorer</p><h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Read-only Mantle contract context</h1><p className="mt-2 max-w-3xl text-text-mid">Fetch bytecode, registry metadata, protocol matches, and risk notes before deciding whether to run an audit.</p></div><span className="rounded-pill border border-success/30 bg-success/10 px-3 py-1 text-sm text-success">Read-only · no wallet action</span></header>
    <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><div className="flex flex-col gap-3 lg:flex-row"><input value={address} onChange={(event) => setAddress(event.target.value)} className="min-h-12 flex-1 rounded-control border-border-subtle bg-terminal font-mono text-sm text-text-hi focus:border-green-400 focus:ring-green-400"/><button onClick={() => fetchContext(debounced)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-control bg-green-400 px-5 font-semibold text-canvas disabled:opacity-50">{loading ? <Loader2 className="animate-spin" size={16}/> : null} Fetch Context</button></div>{error ? <p className="mt-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}</section>
    {data ? <>
      <div className="grid gap-3 md:grid-cols-5"><Summary label="Verified Source" value={data.summary.verifiedSource ? "Verified" : "Unverified"} good={data.summary.verifiedSource}/><Summary label="Contract Type" value={data.summary.contractType}/><Summary label="Protocol Matches" value={`${data.summary.protocolMatches}`}/><Summary label="Owner/Admin" value={data.summary.ownerAdmin}/><Summary label="Last Updated" value={data.summary.lastUpdated}/></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-4">
          <Panel title="Contract Metadata"><JsonRows object={data.metadata}/><AddressLine label="Address" value={data.address}/></Panel>
          <Panel title="ABI Preview" action={<button onClick={() => navigator.clipboard.writeText(fullAbi)} className="rounded-pill border border-border-subtle px-3 py-1 text-xs text-green-400">View Full ABI</button>}><pre className="max-h-56 overflow-auto rounded-card bg-terminal p-3 text-xs text-text-code">{fullAbi}</pre></Panel>
          <Panel title="External Dependencies">{data.dependencies.map((dep) => <div key={dep.label} className="rounded-control border border-border-subtle bg-surface-2 p-3"><AddressLine label={dep.label} value={dep.address}/><p className="mt-1 text-sm text-text-low">{dep.note}</p></div>)}</Panel>
          <Panel title="Known Protocol Interactions"><List items={data.protocolInteractions.map((item) => `${item.name} · ${item.category} · ${item.confidence}% confidence`)}/></Panel>
          <Panel title="Token Exposure"><List items={data.tokenExposure.map((item) => `${item.asset}: ${item.exposure}`)}/></Panel>
          <Panel title="Risk Notes"><List items={data.riskNotes}/></Panel>
          <Panel title="Admin Permissions"><List items={data.adminPermissions}/></Panel>
        </main>
        <aside className="space-y-4">
          <Panel title="Protocol Matches">{data.protocolInteractions.map((item) => <a key={item.name} href={item.link} target="_blank" className="mb-2 block rounded-control border border-border-subtle bg-terminal p-3 hover:border-green-400/40"><div className="flex justify-between gap-3"><span className="font-semibold text-text-hi">{item.name}</span><span className="text-green-400">{item.confidence}%</span></div><p className="mt-1 text-xs text-text-low">{item.category}</p></a>)}</Panel>
          <Panel title="Quick Actions"><div className="space-y-2"><a href={data.explorerUrl} target="_blank" className="inline-flex w-full items-center gap-2 rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-mid hover:border-green-400/40 hover:text-green-400"><ExternalLink size={14}/> Open in Mantle Explorer</a><Link href={data.quickActions.auditStudioUrl} className="inline-flex w-full items-center gap-2 rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-mid hover:border-green-400/40 hover:text-green-400">Run Audit in Audit Studio</Link><span className="inline-flex w-full items-center gap-2 rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-mid hover:border-green-400/40 hover:text-green-400 opacity-70">Generate On-chain Proof <em className="ml-auto text-xs text-warning">Coming soon</em></span><span className="inline-flex w-full items-center gap-2 rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-mid hover:border-green-400/40 hover:text-green-400 opacity-70">Export Contract Report <em className="ml-auto text-xs text-warning">Coming soon</em></span></div></Panel>
        </aside>
      </div>
    </> : <div className="rounded-card border border-border-subtle bg-surface-1 p-10 text-center text-text-low">Fetch a Mantle address to populate context panels.</div>}
  </div>;
}

function Summary({ label, value, good }: { label: string; value: string; good?: boolean }) { return <section className="rounded-card border border-border-subtle bg-surface-1 p-4"><p className="text-xs uppercase tracking-[0.12em] text-text-low">{label}</p><p className={good ? "mt-2 text-sm font-semibold text-success" : "mt-2 text-sm font-semibold text-text-hi"}>{value}</p></section>; }
function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) { return <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-text-hi">{title}</h2>{action}</div><div className="space-y-2 text-sm text-text-mid">{children}</div></section>; }
function CopyButton({ value }: { value: string }) { return <button onClick={() => navigator.clipboard.writeText(value)} className="rounded border border-border-subtle p-1 text-text-low hover:text-green-400"><Copy size={13}/></button>; }
function AddressLine({ label, value }: { label: string; value: string }) { return <div className="flex items-center gap-2"><span className="min-w-28 text-text-low">{label}</span><span className="break-all font-mono text-text-hi">{value}</span><CopyButton value={value}/></div>; }
function JsonRows({ object }: { object: Record<string, unknown> }) { return <div className="grid gap-2 md:grid-cols-2">{Object.entries(object).map(([key, value]) => <div key={key} className="rounded-control bg-terminal p-3"><p className="text-xs uppercase text-text-low">{key}</p><p className="mt-1 break-all font-mono text-text-hi">{String(value)}</p></div>)}</div>; }
function List({ items }: { items: string[] }) { return <ul className="space-y-2">{items.map((item) => <li key={item} className="flex gap-2 rounded-control bg-terminal p-3"><ShieldCheck className="mt-0.5 shrink-0 text-green-400" size={15}/><span>{item}</span></li>)}</ul>; }
