"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Fingerprint } from "lucide-react";
import { FadeRise } from "@/components/motion";

// Verified build attestations: deterministic compile-and-compare between
// deployed runtime bytecode and claimed source. No AI anywhere in this flow.

type Attestation = { id: string; address: string; contractName: string; compilerVersion: string; status: string; matchType: string | null; attestationHash: string | null; createdAt: string };

const MATCH_STYLE: Record<string, string> = {
  exact: "border-success/30 bg-success/10 text-success",
  "partial-metadata": "border-warning/30 bg-warning/10 text-warning",
  mismatch: "border-danger/30 bg-danger-bg text-danger",
};
const short = (v: string | null, n = 10) => (v && v.length > n + 8 ? `${v.slice(0, n)}…${v.slice(-6)}` : v ?? "—");

export function AttestClient() {
  const [address, setAddress] = useState("");
  const [contractName, setContractName] = useState("");
  const [compiler, setCompiler] = useState<"0.8.24" | "0.8.30">("0.8.24");
  const [runs, setRuns] = useState("200");
  const [sourceRef, setSourceRef] = useState("");
  const [source, setSource] = useState("");
  const [path, setPath] = useState("src/Contract.sol");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [list, setList] = useState<Attestation[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/attest", { cache: "no-store" }).then((r) => r.json());
    setList(res.attestations ?? []);
  }, []);
  useEffect(() => { refresh().catch(() => null); }, [refresh]);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/attest/${pending}`, { cache: "no-store" }).then((r) => r.json());
      if (res.attestation && res.attestation.status !== "queued" && res.attestation.status !== "running") {
        setPending(null);
        await refresh();
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [pending, refresh]);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/attest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          contractName: contractName.trim(),
          compilerVersion: compiler,
          optimizerEnabled: true,
          optimizerRuns: Number(runs) || 200,
          sourceRef: sourceRef.trim() || undefined,
          sourceFiles: [{ path: path.trim() || "src/Contract.sol", source }],
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not create attestation.");
      setPending(body.attestationId);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <FadeRise>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-green-400">Verified builds · attestations</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Does the deployed bytecode match the source?</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-text-mid">Archon compiles the claimed source with the declared settings and compares it byte-for-byte against the runtime bytecode on Mantle — immutable references masked via compiler metadata, CBOR metadata trailer handled as a distinct, labeled result. Deterministic end to end; comparison uses runtime (not creation) bytecode, so constructor arguments never blur the result.</p>

      <section className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card">
          <label className="block text-xs text-text-low">Deployed address (Mantle Mainnet)
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" className="mt-1 w-full rounded-control border border-border-subtle bg-terminal px-3 py-2 font-mono text-sm text-text-code outline-none focus:border-green-400/50" />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-xs text-text-low">Contract name
              <input value={contractName} onChange={(e) => setContractName(e.target.value)} placeholder="MyVault" className="mt-1 w-full rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-hi outline-none focus:border-green-400/50" />
            </label>
            <label className="block text-xs text-text-low">Source path
              <input value={path} onChange={(e) => setPath(e.target.value)} className="mt-1 w-full rounded-control border border-border-subtle bg-terminal px-3 py-2 font-mono text-xs text-text-code outline-none focus:border-green-400/50" />
            </label>
            <label className="block text-xs text-text-low">Compiler
              <select value={compiler} onChange={(e) => setCompiler(e.target.value as "0.8.24" | "0.8.30")} className="mt-1 w-full rounded-control border border-border-subtle bg-terminal px-3 py-2 text-sm text-text-hi outline-none">
                <option value="0.8.24">solc 0.8.24</option>
                <option value="0.8.30">solc 0.8.30</option>
              </select>
            </label>
            <label className="block text-xs text-text-low">Optimizer runs
              <input value={runs} onChange={(e) => setRuns(e.target.value)} className="mt-1 w-full rounded-control border border-border-subtle bg-terminal px-3 py-2 font-mono text-sm text-text-code outline-none focus:border-green-400/50" />
            </label>
          </div>
          <label className="mt-3 block text-xs text-text-low">Source reference (repo@commit — recorded in the attestation)
            <input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="github.com/you/repo@abc123" className="mt-1 w-full rounded-control border border-border-subtle bg-terminal px-3 py-2 font-mono text-xs text-text-code outline-none focus:border-green-400/50" />
          </label>
          <button onClick={submit} disabled={busy || !address.trim() || !contractName.trim() || !source.trim()} className="mt-4 inline-flex items-center gap-2 rounded-control bg-green-400 px-4 py-2 text-sm font-semibold text-on-green transition-colors hover:bg-green-300 disabled:opacity-50"><Fingerprint size={15}/> Attest build</button>
          {pending ? <p className="mt-3 text-sm text-warning">Compiling and comparing… results appear below.</p> : null}
          {error ? <p className="mt-3 rounded-control border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p> : null}
        </div>
        <label className="block text-xs text-text-low">Solidity source (the claimed code)
          <textarea value={source} onChange={(e) => setSource(e.target.value)} spellCheck={false} placeholder={"// paste the exact source you claim was deployed\npragma solidity 0.8.24;\n…"} className="mt-1 h-[346px] w-full resize-none rounded-card border border-border-subtle bg-terminal p-3 font-mono text-xs text-text-code outline-none focus:border-green-400/50" />
        </label>
      </section>

      <section className="mt-6 overflow-x-auto rounded-card border border-border-subtle bg-surface-1 shadow-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-border-subtle text-left text-xs uppercase tracking-[0.12em] text-text-low">
            <th className="px-4 py-3">Contract</th><th className="px-4 py-3">Address</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Attestation hash</th><th className="px-4 py-3 text-right">Public page</th>
          </tr></thead>
          <tbody>
            {list.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-text-mid">No attestations yet.</td></tr> : null}
            {list.map((a) => (
              <tr key={a.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3 font-semibold text-text-hi">{a.contractName}<span className="ml-2 font-mono text-[11px] text-text-low">solc {a.compilerVersion?.split("+")[0]}</span></td>
                <td className="px-4 py-3 font-mono text-xs text-text-mid">{short(a.address)}</td>
                <td className="px-4 py-3">{a.status === "done" && a.matchType ? <span className={`rounded-pill border px-2.5 py-0.5 text-xs ${MATCH_STYLE[a.matchType] ?? ""}`}>{a.matchType}</span> : <span className="text-text-low">{a.status}</span>}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-mid">{short(a.attestationHash)}</td>
                <td className="px-4 py-3 text-right"><Link href={`/attest/${a.id}`} className="inline-flex items-center gap-1 text-green-400 hover:text-green-300">verify <ArrowUpRight size={12}/></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </FadeRise>
  );
}
