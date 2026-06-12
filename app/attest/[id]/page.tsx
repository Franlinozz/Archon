import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Fingerprint } from "lucide-react";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { ArchonLogo, CopyButton } from "@/components/archon";
import { MANTLE_EXPLORER_URL } from "@/lib/chain/mantle";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Archon — Verified build attestation", description: "Independently re-checkable build attestation: deployed Mantle bytecode vs claimed source." };

// PUBLIC, read-only attestation verification — no wallet, no app shell, exactly
// like /r/[reportId]. Anyone can re-derive: fetch the runtime bytecode, compile
// the claimed source with the declared settings, mask immutable references,
// compare (with and without the CBOR metadata trailer).
type Row = {
  id: string; address: string; source_ref: string | null; contract_name: string; compiler_version: string | null;
  settings: { optimizerEnabled?: boolean; optimizerRuns?: number; evmVersion?: string } | null; source_hash: string | null;
  status: string; match_type: string | null; onchain_bytecode_hash: string | null; compiled_bytecode_hash: string | null;
  attestation_hash: string | null; detail: { immutableRefsMasked?: number; onchainBytes?: number; compiledBytes?: number } | null;
  error: string | null; created_at: Date;
};

const MATCH_COPY: Record<string, { chip: string; text: string }> = {
  exact: { chip: "border-success/30 bg-success/10 text-success", text: "The deployed runtime bytecode is byte-for-byte identical to the compiled source (immutable references masked)." },
  "partial-metadata": { chip: "border-warning/30 bg-warning/10 text-warning", text: "The executable code matches exactly; only the CBOR metadata trailer (compiler fingerprint, source-hash encoding) differs. The deployed logic is the claimed logic." },
  mismatch: { chip: "border-danger/30 bg-danger-bg text-danger", text: "The deployed bytecode does NOT match this source compiled with these settings." },
};
const short = (v: string | null) => (v && v.length > 20 ? `${v.slice(0, 12)}…${v.slice(-8)}` : v ?? "—");

export default async function PublicAttestationPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await params);
  const row = parsed.success
    ? ((await db.query<Row>(`select id, address, source_ref, contract_name, compiler_version, settings, source_hash, status, match_type, onchain_bytecode_hash, compiled_bytecode_hash, attestation_hash, detail, error, created_at from attestations where id=$1`, [parsed.data.id])).rows[0] ?? null)
    : null;

  return (
    <main className="min-h-screen px-6 py-10 text-text-hi">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <ArchonLogo />
          <Link href="/proofs" className="text-sm text-text-mid hover:text-text-hi">Public proofs →</Link>
        </div>
        {!row ? (
          <div className="mt-10 rounded-card border border-border-subtle bg-surface-1 p-8 text-center text-text-mid">Attestation not found.</div>
        ) : (
          <article className="mt-8 rounded-card border border-border-subtle bg-surface-1 p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-green-400"><Fingerprint size={14}/> Verified build attestation</p>
              {row.status === "done" && row.match_type ? <span className={`rounded-pill border px-3 py-1 text-sm font-semibold ${MATCH_COPY[row.match_type]?.chip ?? ""}`}>{row.match_type}</span> : <span className="rounded-pill border border-border-subtle bg-surface-2 px-3 py-1 text-sm text-text-low">{row.status}</span>}
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-text-hi">{row.contract_name}</h1>
            {row.status === "done" && row.match_type ? <p className="mt-2 text-sm leading-6 text-text-mid">{MATCH_COPY[row.match_type]?.text}</p> : null}
            {row.status === "failed" ? <p className="mt-2 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">Attestation did not complete: {row.error} (a configuration or compile error is reported as exactly that — never as a bytecode mismatch).</p> : null}

            <dl className="mt-6 space-y-2.5 rounded-card border border-border-subtle bg-terminal p-5 font-mono text-[13px]">
              <Row1 k="address" v={<span className="inline-flex items-center gap-1.5">{short(row.address)} <a className="text-green-400 hover:text-green-300" href={`${MANTLE_EXPLORER_URL}/address/${row.address}`} target="_blank" rel="noreferrer"><ArrowUpRight size={12}/></a></span>} />
              <Row1 k="network" v="Mantle Mainnet · 5000" />
              {row.source_ref ? <Row1 k="source ref" v={row.source_ref} /> : null}
              <Row1 k="source hash" v={<span className="inline-flex items-center gap-1.5">{short(row.source_hash)} {row.source_hash ? <CopyButton value={row.source_hash} /> : null}</span>} />
              <Row1 k="compiler" v={`${row.compiler_version ?? "—"} · optimizer ${row.settings?.optimizerEnabled ? `on (${row.settings?.optimizerRuns} runs)` : "off"}${row.settings?.evmVersion ? ` · ${row.settings.evmVersion}` : ""}`} />
              <Row1 k="on-chain bytecode" v={<span className="inline-flex items-center gap-1.5">{short(row.onchain_bytecode_hash)} {row.onchain_bytecode_hash ? <CopyButton value={row.onchain_bytecode_hash} /> : null}</span>} />
              <Row1 k="compiled bytecode" v={<span className="inline-flex items-center gap-1.5">{short(row.compiled_bytecode_hash)} {row.compiled_bytecode_hash ? <CopyButton value={row.compiled_bytecode_hash} /> : null}</span>} />
              {row.detail?.immutableRefsMasked !== undefined ? <Row1 k="immutables masked" v={String(row.detail.immutableRefsMasked)} /> : null}
              <Row1 k="attestation hash" v={<span className="inline-flex items-center gap-1.5">{short(row.attestation_hash)} {row.attestation_hash ? <CopyButton value={row.attestation_hash} /> : null}</span>} />
              <Row1 k="attested" v={row.created_at.toISOString().slice(0, 19).replace("T", " ") + " UTC"} />
            </dl>

            <div className="mt-5 rounded-control border border-border-subtle bg-surface-2 p-4 text-sm leading-6 text-text-mid">
              <p className="font-semibold text-text-hi">Re-derive this yourself</p>
              <p className="mt-1">Fetch the runtime bytecode (<span className="font-mono text-xs">eth_getCode</span>) at the address above, compile the claimed source with the declared compiler and settings, mask the compiler-emitted <span className="font-mono text-xs">immutableReferences</span> ranges, and compare — once raw, once with each side&apos;s CBOR metadata trailer removed. The attestation hash is the canonical SHA-256 of the result object, anchorable on-chain via ArchonProofRegistry&apos;s permissionless <span className="font-mono text-xs">logAuditProof</span>.</p>
            </div>
          </article>
        )}
      </div>
    </main>
  );
}

function Row1({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4"><dt className="shrink-0 text-muted">{k}</dt><dd className="min-w-0 break-all text-right text-text-code">{v}</dd></div>;
}
