"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, X } from "lucide-react";
import { explorerTxUrl } from "@/lib/chain/mantle";
import { useSiwe } from "@/components/auth/SiweProvider";

export function GasProofModal({ reportId, reportHash }: { reportId: string; reportHash?: string | null }) {
  const { signedIn, signIn, status: siweStatus } = useSiwe();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function anchor() {
    if (!signedIn) { await signIn(); return; }
    setBusy(true); setError(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 110_000);
    try {
      const res = await fetch(`/api/gas/reports/${reportId}/anchor`, { method: "POST", signal: ctrl.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not anchor gas proof.");
      setTxHash(data.txHash ?? null);
    } catch (err) { setError((err as Error)?.name === "AbortError" ? "Anchoring is still pending. Retry or check the explorer." : err instanceof Error ? err.message : "Could not anchor gas proof."); }
    finally { clearTimeout(timer); setBusy(false); }
  }

  return <>
    <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-control border border-green-400/40 bg-green-400/10 px-3 py-2 text-sm font-semibold text-green-400"><Lock size={15}/> Anchor proof</button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"><div className="w-full max-w-xl rounded-card border border-border-subtle bg-surface-1 p-5 shadow-lift">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.14em] text-green-400">Gas Proof</p><h2 className="mt-2 text-2xl font-semibold text-text-hi">Anchor gas report on Mantle</h2><p className="mt-2 text-sm leading-6 text-text-mid">This logs the gas report hash through ArchonProofRegistry. It does not touch the audited contract.</p></div><button onClick={() => setOpen(false)} className="rounded-control border border-border-subtle bg-surface-2 p-2 text-text-mid"><X size={16}/></button></div>
      <div className="mt-5 rounded-card border border-border-subtle bg-terminal p-4 text-sm"><p className="text-text-low">Report hash</p><p className="mt-1 break-all font-mono text-text-hi">{reportHash ?? "not ready"}</p></div>
      <label className="mt-4 flex items-start gap-3 rounded-card border border-border-subtle bg-surface-2 p-4 text-sm text-text-mid"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 rounded border-border-subtle bg-terminal text-green-400 focus:ring-green-400"/> I understand this anchors a proof on Mantle Mainnet.</label>
      {error ? <p className="mt-4 flex gap-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"><AlertTriangle size={15}/>{error}</p> : null}
      {txHash ? <p className="mt-4 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"><CheckCircle2 className="mr-2 inline" size={16}/>Anchored. <a href={explorerTxUrl(txHash)} target="_blank" className="underline">View transaction</a></p> : null}
      <div className="mt-5 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid">Close</button><button disabled={!checked || busy || !reportHash || siweStatus === "signing"} onClick={anchor} className="rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-on-green disabled:cursor-not-allowed disabled:opacity-40">{!signedIn ? "Sign in & anchor" : busy ? "Anchoring…" : "Anchor proof"}</button></div>
    </div></div> : null}
  </>;
}
