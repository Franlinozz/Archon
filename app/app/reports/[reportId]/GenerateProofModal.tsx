"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useChainModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { CheckCircle2, Copy, Lock, X } from "lucide-react";
import { explorerTxUrl, MANTLE_CHAIN_ID } from "@/lib/chain/mantle";
import { shortenAddress } from "@/lib/chain/useWallet";

type PreparedProof = { proofId: string; reportHash: string; metadataUri: string; chainId: number; network: string; configured: boolean; blocker: string | null; gasEstimate: string | null };

export function GenerateProofModal({ reportId }: { reportId: string }) {
  const { address, isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openChainModal } = useChainModal();
  const onMantle = isConnected && chainId === MANTLE_CHAIN_ID;
  const [open, setOpen] = useState(false);
  const [prepared, setPrepared] = useState<PreparedProof | null>(null);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function openModal() {
    setOpen(true); setStatus(null); setTxHash(null); setLoading(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/proof`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not prepare proof.");
      setPrepared(data);
    } catch (err) { setStatus(err instanceof Error ? err.message : "Could not prepare proof."); }
    finally { setLoading(false); }
  }

  // Network guard: the write stays disabled until a wallet is connected on Mantle Mainnet.
  const canSign = Boolean(prepared?.configured && checked && !loading && !txHash && onMantle);

  async function signAndLog() {
    if (!canSign || !prepared) return;
    setLoading(true); setStatus("Simulating ERC-8004 Reputation write…");
    try {
      const response = await fetch(`/api/reports/${reportId}/proof`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "log" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not log proof.");
      setTxHash(data.txHash);
      setStatus(`Proof logged. Gas used ${data.gas?.used ?? "unknown"}.`);
    } catch (err) { setStatus(err instanceof Error ? err.message : "Could not log proof."); }
    finally { setLoading(false); }
  }

  return <>
    <button onClick={openModal} className="inline-flex items-center gap-2 rounded-control border border-green-400/40 bg-green-400/10 px-3 py-2 text-sm font-semibold text-green-400"><Lock size={15}/> Generate Proof</button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card border border-border-subtle bg-surface-1 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.14em] text-green-400">Generate Proof</p><h2 className="mt-2 text-2xl font-semibold text-text-hi">Log report proof on Mantle</h2><p className="mt-2 text-sm text-text-mid">Scanning is read-only. This action only logs a cryptographic proof of the report; it does not modify the audited contract.</p></div><button onClick={() => setOpen(false)} className="rounded-control border border-border-subtle bg-surface-2 p-2 text-text-mid"><X size={16}/></button></div>
        {loading && !prepared ? <p className="mt-5 rounded-control border border-border-subtle bg-terminal p-4 text-text-mid">Preparing deterministic report hash…</p> : null}
        {prepared ? <div className="mt-5 grid gap-3 rounded-card border border-border-subtle bg-terminal p-4 text-sm">
          <Row label="Report hash" value={prepared.reportHash} copy/>
          <Row label="Network" value="Mantle Mainnet · Chain ID 5000"/>
          <Row label="Estimated gas" value={prepared.gasEstimate ?? "Blocked until ERC-8004 simulation is configured"}/>
          <Row label="Connected wallet" value={address ? shortenAddress(address) : "Not connected"}/>
          <Row label="Metadata URI" value={prepared.metadataUri.slice(0, 54) + "…"} copyValue={prepared.metadataUri}/>
          {!isConnected ? <button onClick={openConnectModal} className="rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-on-green">Connect wallet on Mantle to enable proof logging</button> : null}
          {isConnected && !onMantle ? <button onClick={openChainModal} className="rounded-control bg-warning px-3 py-2 text-sm font-semibold text-canvas">Switch to Mantle Mainnet</button> : null}
          {prepared.blocker ? <p className="rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-warning">{prepared.blocker}</p> : <p className="rounded-control border border-success/30 bg-success/10 px-3 py-2 text-success">Server-side proof signer is configured. The Reputation entry is submitted by Archon’s dedicated non-owner client wallet to satisfy ERC-8004 self-feedback rules.</p>}
        </div> : null}
        <label className="mt-5 flex items-start gap-3 rounded-card border border-border-subtle bg-surface-2 p-4 text-sm text-text-mid"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-1 rounded border-border-subtle bg-terminal text-green-400 focus:ring-green-400"/> <span>I understand this will log a report proof on Mantle Mainnet</span></label>
        {status ? <p className="mt-4 rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-mid">{status}</p> : null}
        {txHash ? <div className="mt-4 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"><CheckCircle2 className="mr-2 inline" size={16}/> Proof logged. <a className="underline" href={explorerTxUrl(txHash)} target="_blank">View explorer</a></div> : null}
        <div className="mt-5 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid">Cancel</button><button disabled={!canSign} onClick={signAndLog} className="rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-canvas disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Preparing…" : "Sign & Log Proof"}</button></div>
      </div>
    </div> : null}
  </>;
}

function Row({ label, value, copy, copyValue }: { label: string; value: string; copy?: boolean; copyValue?: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="shrink-0 text-text-low">{label}</span><span className="break-all font-mono text-text-hi">{value}</span>{copy || copyValue ? <button onClick={() => navigator.clipboard.writeText(copyValue ?? value)} className="rounded border border-border-subtle p-1 text-text-low hover:text-green-400"><Copy size={13}/></button> : null}</div>;
}
