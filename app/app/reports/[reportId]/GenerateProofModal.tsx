"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useChainModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { formatEther } from "viem";
import { CheckCircle2, Copy, Lock, ServerCog, Wallet, X } from "lucide-react";
import reputationRegistryAbi from "@/lib/chain/abis/ReputationRegistry.json";
import { explorerTxUrl, MANTLE_CHAIN_ID } from "@/lib/chain/mantle";
import { shortenAddress } from "@/lib/chain/useWallet";
import { useSiwe } from "@/components/auth/SiweProvider";

type SelfCustody = { reputationRegistry: string; agentId: string; value: number; valueDecimals: number; tag1: string; tag2: string; endpoint: string };
type PreparedProof = { proofId: string; reportHash: string; metadataUri: string; chainId: number; network: string; configured: boolean; blocker: string | null; gasEstimate: string | null; selfCustody: SelfCustody | null };
type Mode = "server" | "self";

export function GenerateProofModal({ reportId }: { reportId: string }) {
  const { address, isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openChainModal } = useChainModal();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signedIn, signIn, status: siweStatus } = useSiwe();
  const onMantle = isConnected && chainId === MANTLE_CHAIN_ID;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("server");
  const [prepared, setPrepared] = useState<PreparedProof | null>(null);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [gasMnt, setGasMnt] = useState<string | null>(null);

  async function openModal() {
    setOpen(true); setStatus(null); setTxHash(null); setVerified(false); setLoading(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/proof`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not prepare proof.");
      setPrepared(data);
    } catch (err) { setStatus(err instanceof Error ? err.message : "Could not prepare proof."); }
    finally { setLoading(false); }
  }

  // Live self-custody gas estimate (MNT). Only when on Mantle with a connected wallet.
  useEffect(() => {
    if (mode !== "self" || !onMantle || !prepared?.selfCustody || !publicClient || !address) { setGasMnt(null); return; }
    let active = true;
    const sc = prepared.selfCustody;
    const args = [BigInt(sc.agentId), BigInt(sc.value), sc.valueDecimals, sc.tag1, sc.tag2, sc.endpoint, prepared.metadataUri, prepared.reportHash as `0x${string}`] as const;
    (async () => {
      try {
        const gas = await publicClient.estimateContractGas({ account: address, address: sc.reputationRegistry as `0x${string}`, abi: reputationRegistryAbi, functionName: "giveFeedback", args });
        const price = await publicClient.getGasPrice();
        if (active) setGasMnt(formatEther(gas * price));
      } catch { if (active) setGasMnt(null); }
    })();
    return () => { active = false; };
  }, [mode, onMantle, prepared, publicClient, address]);

  async function logServer() {
    if (!prepared || loading || txHash) return;
    setLoading(true); setStatus("Archon's server wallet is anchoring the proof…");
    try {
      const response = await fetch(`/api/reports/${reportId}/proof`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "log" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not log proof.");
      setTxHash(data.txHash); setVerified(true);
      setStatus(`Proof anchored by Archon. Gas used ${data.gas?.used ?? "unknown"}. Logged by ${shortenAddress(data.client)} (Archon agent client).`);
    } catch (err) { setStatus(err instanceof Error ? err.message : "Could not log proof."); }
    finally { setLoading(false); }
  }

  async function logSelf() {
    if (!prepared?.selfCustody || !onMantle || loading || txHash) return;
    const sc = prepared.selfCustody;
    setLoading(true); setStatus("Opening your wallet to sign giveFeedback…");
    try {
      const args = [BigInt(sc.agentId), BigInt(sc.value), sc.valueDecimals, sc.tag1, sc.tag2, sc.endpoint, prepared.metadataUri, prepared.reportHash as `0x${string}`] as const;
      const hash = await writeContractAsync({ address: sc.reputationRegistry as `0x${string}`, abi: reputationRegistryAbi, functionName: "giveFeedback", args });
      setTxHash(hash); setStatus("Transaction submitted. Verifying the on-chain event…");
      const response = await fetch(`/api/reports/${reportId}/proof`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "record-self-custody", txHash: hash }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Verification failed.");
      setVerified(true);
      setStatus(`Verified. Proof logged by your wallet (${shortenAddress(data.loggedBy)}).`);
    } catch (err) { setStatus(err instanceof Error ? err.message : "Could not log proof from your wallet."); }
    finally { setLoading(false); }
  }

  const needsSignIn = isConnected && onMantle && !signedIn;
  const canServer = Boolean(prepared?.configured && checked && !loading && !txHash && signedIn);
  const canSelf = Boolean(prepared?.selfCustody && checked && !loading && !txHash && onMantle && signedIn);

  return <>
    <button onClick={openModal} className="inline-flex items-center gap-2 rounded-control border border-green-400/40 bg-green-400/10 px-3 py-2 text-sm font-semibold text-green-400"><Lock size={15}/> Generate Proof</button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card border border-border-subtle bg-surface-1 p-5 shadow-lift">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.14em] text-green-400">Generate Proof</p><h2 className="mt-2 text-2xl font-semibold text-text-hi">Log report proof on Mantle</h2><p className="mt-2 text-sm text-text-mid">Scanning is read-only. This only logs a cryptographic proof of the report; it never modifies the audited contract.</p></div><button onClick={() => setOpen(false)} className="rounded-control border border-border-subtle bg-surface-2 p-2 text-text-mid"><X size={16}/></button></div>

        {loading && !prepared ? <p className="mt-5 rounded-control border border-border-subtle bg-terminal p-4 text-text-mid">Preparing deterministic report hash…</p> : null}

        {prepared ? <>
          <div className="mt-5 grid gap-3 rounded-card border border-border-subtle bg-terminal p-4 text-sm">
            <Row label="Report hash" value={prepared.reportHash} copy/>
            <Row label="Network" value="Mantle Mainnet · Chain ID 5000"/>
            <Row label="Connected wallet" value={address ? shortenAddress(address) : "Not connected"}/>
            <Row label="Sign-in" value={signedIn ? "Signed in (ownership verified, free signature)" : isConnected ? "Not signed in" : "Connect to sign in"}/>
            <Row label="Metadata URI" value={prepared.metadataUri.slice(0, 54) + "…"} copyValue={prepared.metadataUri}/>
          </div>

          {/* Mode selector */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ModeCard active={mode === "server"} onClick={() => setMode("server")} icon={<ServerCog size={16}/>} title="Archon logs it for me" tag="Default · gasless"
              body="Archon's server wallet anchors the proof. No gas, no signature from you — you only approve."/>
            <ModeCard active={mode === "self"} onClick={() => setMode("self")} icon={<Wallet size={16}/>} title="I log it from my wallet" tag="Self-custody · ~small MNT gas"
              body={`Your wallet signs and submits the transaction. Estimated gas: ${mode === "self" ? (gasMnt ? `~${Number(gasMnt).toFixed(5)} MNT` : "—") : "select to estimate"}.`}/>
          </div>

          {prepared.blocker ? <p className="mt-4 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">{prepared.blocker}</p> : null}

          {/* Wallet gating for the active mode */}
          {!isConnected ? <button onClick={openConnectModal} className="mt-4 w-full rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-on-green">Connect wallet</button>
            : !onMantle ? <button onClick={openChainModal} className="mt-4 w-full rounded-control bg-warning px-3 py-2 text-sm font-semibold text-canvas">Wrong network — Switch to Mantle</button>
            : needsSignIn ? <button onClick={() => void signIn()} disabled={siweStatus === "signing"} className="mt-4 w-full rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-on-green disabled:opacity-50">{siweStatus === "signing" ? "Check your wallet to sign…" : "Sign in — free signature (no gas)"}</button>
            : null}

          {mode === "self" && !prepared.selfCustody ? <p className="mt-3 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">Self-custody logging is unavailable until ERC-8004 registries are configured. Use the gasless option.</p> : null}

          <label className="mt-4 flex items-start gap-3 rounded-card border border-border-subtle bg-surface-2 p-4 text-sm text-text-mid"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-1 rounded border-border-subtle bg-terminal text-green-400 focus:ring-green-400"/> <span>I understand this will log a report proof on Mantle Mainnet</span></label>

          {status ? <p className="mt-4 rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-mid">{status}</p> : null}
          {txHash ? <div className="mt-4 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{verified ? <CheckCircle2 className="mr-2 inline" size={16}/> : null}{verified ? "Proof verified. " : "Submitted. "}<a className="underline" href={explorerTxUrl(txHash)} target="_blank">View on explorer</a></div> : null}

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid">Cancel</button>
            {mode === "server"
              ? <button disabled={!canServer} onClick={logServer} className="rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-on-green disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Anchoring…" : "Approve & Anchor (gasless)"}</button>
              : <button disabled={!canSelf} onClick={logSelf} className="rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-on-green disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Awaiting wallet…" : "Sign & Log Proof"}</button>}
          </div>
        </> : null}
      </div>
    </div> : null}
  </>;
}

function ModeCard({ active, onClick, icon, title, tag, body }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; tag: string; body: string }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={`rounded-card border p-3 text-left transition-colors ${active ? "border-green-400/50 bg-green-400/10" : "border-border-subtle bg-surface-2 hover:border-border-emphasis"}`}>
      <div className="flex items-center gap-2 text-text-hi"><span className={active ? "text-green-400" : "text-text-mid"}>{icon}</span><span className="text-sm font-semibold">{title}</span></div>
      <p className="mt-1 text-xs uppercase tracking-[0.1em] text-green-400">{tag}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-text-mid">{body}</p>
    </button>
  );
}

function Row({ label, value, copy, copyValue }: { label: string; value: string; copy?: boolean; copyValue?: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="shrink-0 text-text-low">{label}</span><span className="break-all font-mono text-text-hi">{value}</span>{copy || copyValue ? <button onClick={() => navigator.clipboard.writeText(copyValue ?? value)} className="rounded border border-border-subtle p-1 text-text-low hover:text-green-400"><Copy size={13}/></button> : null}</div>;
}
