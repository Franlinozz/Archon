"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useChainModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { formatEther } from "viem";
import { AlertTriangle, CheckCircle2, Copy, Lock, ServerCog, Wallet, X } from "lucide-react";
import identityRegistryAbi from "@/lib/chain/abis/IdentityRegistry.json";
import archonProofRegistryAbi from "@/lib/chain/abis/ArchonProofRegistry.json";
import { explorerTxUrl, MANTLE_CHAIN_ID } from "@/lib/chain/mantle";
import { shortenAddress } from "@/lib/chain/useWallet";
import { useSiwe } from "@/components/auth/SiweProvider";

type SelfCustody =
  | { mechanism: "archon-registry"; registry: string; reportHash: string; metadataURI: string; riskScore: number; agentId: string }
  | { mechanism: "identity-setMetadata"; identityRegistry: string; agentId: string; metadataKey: string; metadataValue: string };

// Build the exact write call for whichever anchor mechanism the server returned.
function buildWrite(sc: SelfCustody) {
  if (sc.mechanism === "archon-registry") {
    return { address: sc.registry as `0x${string}`, abi: archonProofRegistryAbi, functionName: "logAuditProof", args: [sc.reportHash as `0x${string}`, sc.metadataURI, sc.riskScore, BigInt(sc.agentId)] as const };
  }
  return { address: sc.identityRegistry as `0x${string}`, abi: identityRegistryAbi, functionName: "setMetadata", args: [BigInt(sc.agentId), sc.metadataKey, sc.metadataValue as `0x${string}`] as const };
}
type PreparedProof = { proofId: string; reportHash: string; metadataUri: string; chainId: number; network: string; configured: boolean; blocker: string | null; selfCustody: SelfCustody | null };
type Mode = "server" | "self";
// State machine — every terminal state renders a clear message + next action.
type Phase = "idle" | "preparing" | "ready" | "simulating" | "awaiting" | "submitting" | "pending" | "confirmed" | "reverted" | "timeout";

// Turn a viem/contract error into a short, human message.
function readableError(e: unknown): string {
  const raw = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? "Something went wrong.";
  const first = raw.split("\n")[0] ?? raw;
  if (/self-feedback not allowed/i.test(raw)) return "Reputation feedback can't self-rate this agent — Archon now anchors proofs via identity attestation. Please retry.";
  if (/not the owner|unauthor|ownable|caller is not/i.test(raw)) return "Only Archon's agent-owner wallet can self-attest. Use the gasless option, or connect the owner wallet.";
  if (/insufficient/i.test(raw)) return first;
  return first.slice(0, 180);
}

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
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [gasMnt, setGasMnt] = useState<string | null>(null);

  const busy = phase === "simulating" || phase === "awaiting" || phase === "submitting" || phase === "pending";
  const done = phase === "confirmed";

  async function openModal() {
    setOpen(true); setStatus(null); setErrorMsg(null); setTxHash(null); setChecked(false); setPhase("preparing");
    try {
      const response = await fetch(`/api/reports/${reportId}/proof`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not prepare proof.");
      setPrepared(data); setPhase("ready");
    } catch (err) { setErrorMsg(readableError(err)); setPhase("idle"); }
  }

  // Live self-custody gas estimate (MNT) for the setMetadata call.
  useEffect(() => {
    if (mode !== "self" || !onMantle || !prepared?.selfCustody || !publicClient || !address) { setGasMnt(null); return; }
    let active = true;
    const w = buildWrite(prepared.selfCustody);
    (async () => {
      try {
        const gas = await publicClient.estimateContractGas({ account: address, address: w.address, abi: w.abi, functionName: w.functionName, args: w.args });
        const price = await publicClient.getGasPrice();
        if (active) setGasMnt(formatEther(gas * price));
      } catch { if (active) setGasMnt(null); }
    })();
    return () => { active = false; };
  }, [mode, onMantle, prepared, publicClient, address]);

  // Gasless: server (agent owner) self-attests. Bounded by a client timeout so the
  // UI can never sit on "Anchoring…" forever.
  async function logServer() {
    if (!prepared) return;
    setPhase("submitting"); setStatus("Archon is anchoring the proof on-chain (gasless)…"); setErrorMsg(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 110_000);
    try {
      const res = await fetch(`/api/reports/${reportId}/proof`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "log" }), signal: ctrl.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not anchor the proof.");
      setTxHash(data.txHash ?? null); setPhase("confirmed");
      setStatus(data.alreadyAnchored ? "This report is already anchored on Mantle." : `Anchored by Archon's agent. Gas used ${data.gas?.used ?? "—"}.`);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") { setPhase("timeout"); setStatus("Anchoring is taking longer than expected — retry, or check the explorer."); }
      else { setPhase("reverted"); setErrorMsg(readableError(err)); setStatus(null); }
    } finally { clearTimeout(timer); }
  }

  // Self-custody: simulate FIRST (catch reverts before the wallet opens), then sign,
  // then verify the receipt server-side (bounded). Never submits a doomed tx.
  async function logSelf() {
    if (!prepared?.selfCustody || !onMantle) return;
    const w = buildWrite(prepared.selfCustody);
    setErrorMsg(null);
    try {
      if (publicClient) {
        setPhase("simulating"); setStatus("Checking the transaction will succeed…");
        // Hard timeout: a slow/hanging RPC must never leave this on "Checking…"
        // forever. A genuine revert rejects fast (caught below → "reverted" with a
        // clear reason). A timeout is non-fatal — we proceed to the wallet, which
        // surfaces any real revert itself. So owner/non-owner both reach a definite
        // state within the window.
        const sim = publicClient.simulateContract({ account: address, address: w.address, abi: w.abi, functionName: w.functionName, args: w.args });
        const TIMED_OUT = Symbol("timeout");
        let timer: ReturnType<typeof setTimeout> | undefined;
        const raced = await Promise.race([
          sim.then(() => "ok" as const),
          new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), 12_000); }),
        ]);
        if (timer) clearTimeout(timer);
        if (raced === TIMED_OUT) {
          sim.catch(() => {}); // we've moved on; don't leak an unhandled rejection
          setStatus("Pre-check timed out — continuing; your wallet will confirm the final result.");
        }
      }
      setPhase("awaiting"); setStatus("Confirm in your wallet — a small MNT gas fee, no token spend.");
      const hash = await writeContractAsync({ address: w.address, abi: w.abi, functionName: w.functionName, args: w.args });
      setTxHash(hash); setPhase("pending"); setStatus("Submitted. Verifying the on-chain attestation…");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 110_000);
      try {
        const res = await fetch(`/api/reports/${reportId}/proof`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "record-self-custody", txHash: hash }), signal: ctrl.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Verification failed.");
        setPhase("confirmed"); setStatus(`Verified. Logged by your wallet (${shortenAddress(data.loggedBy)}).`);
      } finally { clearTimeout(timer); }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") { setPhase("timeout"); setStatus("Still pending after 110s — check the explorer; you can retry."); }
      else { setPhase("reverted"); setErrorMsg(readableError(err)); setStatus(null); }
    }
  }

  const needsSignIn = isConnected && onMantle && !signedIn;
  const retryable = phase === "reverted" || phase === "timeout";
  const canAct = Boolean(prepared?.configured && checked && signedIn && !busy && !done);
  const canServer = canAct && (phase === "ready" || retryable);
  const canSelf = canAct && Boolean(prepared?.selfCustody) && onMantle && (phase === "ready" || retryable);

  return <>
    <button onClick={openModal} className="inline-flex items-center gap-2 rounded-control border border-green-400/40 bg-green-400/10 px-3 py-2 text-sm font-semibold text-green-400"><Lock size={15}/> Generate Proof</button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card border border-border-subtle bg-surface-1 p-5 shadow-lift">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.14em] text-green-400">Generate Proof</p><h2 className="mt-2 text-2xl font-semibold text-text-hi">Anchor report proof on Mantle</h2><p className="mt-2 text-sm text-text-mid">Scanning is read-only. This anchors a cryptographic proof of the report on Mantle Mainnet (ArchonProofRegistry, under ERC-8004 Agent #97); it never modifies the audited contract.</p></div><button onClick={() => setOpen(false)} className="rounded-control border border-border-subtle bg-surface-2 p-2 text-text-mid"><X size={16}/></button></div>

        {phase === "preparing" && !prepared ? <p className="mt-5 rounded-control border border-border-subtle bg-terminal p-4 text-text-mid">Preparing deterministic report hash…</p> : null}

        {prepared ? <>
          <div className="mt-5 grid gap-3 rounded-card border border-border-subtle bg-terminal p-4 text-sm">
            <Row label="Report hash" value={prepared.reportHash} copy/>
            <Row label="Anchor" value={prepared.selfCustody?.mechanism === "identity-setMetadata" ? "ERC-8004 Identity · setMetadata · Mantle 5000" : "ArchonProofRegistry · logAuditProof · Mantle 5000"}/>
            <Row label="Connected wallet" value={address ? shortenAddress(address) : "Not connected"}/>
            <Row label="Sign-in" value={signedIn ? "Signed in (ownership verified, free signature)" : isConnected ? "Not signed in" : "Connect to sign in"}/>
            <Row label="Metadata URI" value={prepared.metadataUri.slice(0, 54) + "…"} copyValue={prepared.metadataUri}/>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ModeCard active={mode === "server"} onClick={() => setMode("server")} icon={<ServerCog size={16}/>} title="Archon logs it for me" tag="Default · gasless"
              body="Archon's agent wallet anchors the proof. No gas, no signature from you — you only approve."/>
            <ModeCard active={mode === "self"} onClick={() => setMode("self")} icon={<Wallet size={16}/>} title="I log it from my wallet" tag="Self-custody · ~small MNT gas"
              body={`Your wallet signs and submits it (requires the agent-owner wallet). Estimated gas: ${mode === "self" ? (gasMnt ? `~${Number(gasMnt).toFixed(5)} MNT` : "—") : "select to estimate"}.`}/>
          </div>

          {prepared.blocker ? <p className="mt-4 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">{prepared.blocker}</p> : null}

          {!isConnected ? <button onClick={openConnectModal} className="mt-4 w-full rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-on-green">Connect wallet</button>
            : !onMantle ? <button onClick={openChainModal} className="mt-4 w-full rounded-control bg-warning px-3 py-2 text-sm font-semibold text-canvas">Wrong network — Switch to Mantle</button>
            : needsSignIn ? <button onClick={() => void signIn()} disabled={siweStatus === "signing"} className="mt-4 w-full rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-on-green disabled:opacity-50">{siweStatus === "signing" ? "Check your wallet to sign…" : "Sign in — free signature (no gas)"}</button>
            : null}

          {mode === "self" && !prepared.selfCustody ? <p className="mt-3 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">Self-custody is unavailable until ERC-8004 registries are configured. Use the gasless option.</p> : null}

          <label className="mt-4 flex items-start gap-3 rounded-card border border-border-subtle bg-surface-2 p-4 text-sm text-text-mid"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-1 rounded border-border-subtle bg-terminal text-green-400 focus:ring-green-400"/> <span>I understand this anchors a report proof on Mantle Mainnet</span></label>

          {status ? <p className="mt-4 rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-mid">{status}</p> : null}
          {errorMsg ? <p className="mt-4 flex items-start gap-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"><AlertTriangle size={15} className="mt-0.5 shrink-0"/> {errorMsg}</p> : null}
          {txHash ? <div className="mt-4 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{done ? <CheckCircle2 className="mr-2 inline" size={16}/> : null}{done ? "Proof on-chain. " : "Transaction: "}<a className="underline" href={explorerTxUrl(txHash)} target="_blank">View on Mantlescan</a></div> : null}

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid">Close</button>
            {!done ? (mode === "server"
              ? <button disabled={!canServer} onClick={logServer} className="rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-on-green disabled:cursor-not-allowed disabled:opacity-40">{phase === "submitting" ? "Anchoring…" : retryable ? "Retry" : "Approve & Anchor (gasless)"}</button>
              : <button disabled={!canSelf} onClick={logSelf} className="rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-on-green disabled:cursor-not-allowed disabled:opacity-40">{phase === "simulating" ? "Checking…" : phase === "awaiting" ? "Confirm in wallet…" : phase === "pending" ? "Verifying…" : retryable ? "Retry" : "Sign & Log Proof"}</button>) : null}
          </div>
        </> : errorMsg && phase === "idle" ? <p className="mt-5 flex items-start gap-2 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"><AlertTriangle size={15} className="mt-0.5 shrink-0"/> {errorMsg}</p> : null}
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
