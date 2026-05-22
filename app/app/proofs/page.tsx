import { db } from "@/lib/db/client";
import { deterministicReportHash } from "@/lib/proof/canonical";
import { explorerTxUrl, validationRegistryStatus } from "@/lib/chain/mantle";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { CopyButton } from "@/components/archon";

export const dynamic = "force-dynamic";

type ProofRow = {
  id: string; reportId: string; contractName: string; riskScore: number; reportHash: string; txHash: string | null; metadataUri: string; metadata: Record<string, unknown> | null; network: string; loggedAt: string | null; verificationStatus: string;
};

export default async function Page() {
  const proofs = await db.query<ProofRow>(
    `select p.id, p.report_id as "reportId", r.contract_name as "contractName", r.risk_score as "riskScore", p.report_hash as "reportHash", p.tx_hash as "txHash", p.metadata_uri as "metadataUri", p.metadata, p.network, p.logged_at as "loggedAt", p.verification_status as "verificationStatus"
     from proofs p join reports r on r.id=p.report_id order by p.logged_at desc nulls last, p.created_at desc limit 25`,
  );
  const rows = proofs.rows;
  const selected = rows[0] ?? null;
  const rederived = selected?.metadata ? deterministicReportHash(selected.metadata) : null;
  const verified = Boolean(selected && rederived === selected.reportHash && (selected.txHash || selected.verificationStatus === "prepared"));
  const validation = validationRegistryStatus();
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-4xl font-bold tracking-tight text-text-hi">On-chain Proof & Reports</h1><p className="mt-2 max-w-3xl text-text-mid">Verify Archon audit reports against deterministic report hashes, stored metadata, and ERC-8004 Identity/Reputation proof records.</p></div><span className="rounded-pill border border-warning/30 bg-warning/10 px-3 py-1 text-sm text-warning">Mantle proof path · Identity + Reputation only</span></div>{!validation.available ? <p className="rounded-card border border-border-subtle bg-surface-1 p-3 text-sm text-text-mid">{validation.note} Validation/challenge flows are hidden until an official address is published.</p> : null}
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><span className="rounded-pill border border-green-400/35 bg-green-400/10 px-3 py-1.5 text-sm text-green-400">Report History</span><span className="rounded-pill border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-text-mid">Proof Verification</span></div><input placeholder="Search contract, hash, tx hash…" className="min-w-72 rounded-control border-border-subtle bg-terminal text-sm text-text-hi placeholder:text-text-low" /></div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs"><Chip label="All" active/><Chip label="Verified"/><Chip label="High Risk"/><Chip label="Needs Review"/></div>
        <div className="mt-4 overflow-hidden rounded-card border border-border-subtle"><table className="w-full text-left text-sm"><thead className="bg-surface-2 text-text-low"><tr><th className="p-3">Contract</th><th className="p-3">Risk Score</th><th className="p-3">Report Hash</th><th className="p-3">Network</th><th className="p-3">Logged At</th><th className="p-3">Status</th></tr></thead><tbody>{rows.map((proof) => <tr key={proof.id} className="border-t border-border-subtle hover:bg-surface-2"><td className="p-3 text-text-hi">{proof.contractName}</td><td className="p-3 text-warning">{proof.riskScore}</td><td className="p-3 font-mono text-text-mid">{short(proof.reportHash)} <CopyButton value={proof.reportHash}/></td><td className="p-3 text-text-mid">Mantle Mainnet</td><td className="p-3 text-text-low">{proof.loggedAt ? new Date(proof.loggedAt).toLocaleString() : "Prepared"}</td><td className="p-3"><span className={proof.txHash ? "rounded-pill border border-success/30 bg-success/10 px-2 py-1 text-xs text-success" : "rounded-pill border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning"}>{proof.txHash ? "Proof Logged" : proof.verificationStatus}</span></td></tr>)}{!rows.length ? <tr><td colSpan={6} className="p-8 text-center text-text-low">No proof rows yet. Generate a proof from a completed report to populate this table.</td></tr> : null}</tbody></table></div>
        <section className="mt-5 rounded-card border border-border-subtle bg-terminal p-4"><p className="text-xs uppercase tracking-[0.14em] text-green-400">Proof Verification</p><p className="mt-2 text-sm text-text-mid">The verification tab re-derives the report hash from stored canonical metadata and compares it with the proof row. Session 5 uses ERC-8004 Identity + Reputation only; Validation Registry UI is intentionally absent until the official ERC-8004 repo publishes a Mantle Mainnet address.</p>{selected ? <div className="mt-3 grid gap-2 text-sm"><Line label="Stored hash" value={selected.reportHash}/><Line label="Re-derived hash" value={rederived ?? "No metadata"}/><Line label="Result" value={rederived === selected.reportHash ? "Hash match" : "Hash mismatch"}/></div> : null}</section>
      </section>
      <aside className="rounded-card border border-border-subtle bg-surface-1 p-5">
        <p className="text-xs uppercase tracking-[0.14em] text-green-400">Selected Report</p>{selected ? <div className="mt-4 space-y-4 text-sm"><Line label="Contract" value={selected.contractName}/><Line label="Report Hash" value={selected.reportHash} copy/><Line label="Transaction Hash" value={selected.txHash ?? "Not logged yet"} copy={Boolean(selected.txHash)}/><Line label="Metadata URI" value={selected.metadataUri} copy/><Line label="Network" value="Mantle Mainnet"/><Line label="Logged At" value={selected.loggedAt ? new Date(selected.loggedAt).toLocaleString() : "Prepared"}/>{selected.txHash ? <a href={explorerTxUrl(selected.txHash)} target="_blank" className="inline-flex items-center gap-2 rounded-control border border-green-400/35 bg-green-400/10 px-3 py-2 text-green-400">Explorer link <ExternalLink size={14}/></a> : null}<div className={verified ? "rounded-card border border-success/30 bg-success/10 p-4 text-success" : "rounded-card border border-warning/30 bg-warning/10 p-4 text-warning"}><ShieldCheck className="mb-2" size={20}/><p className="font-semibold">{verified ? "Proof Verified" : "Needs on-chain proof"}</p><p className="mt-1 text-xs opacity-80">{rederived === selected.reportHash ? "Canonical metadata hash matches the proof row." : "Stored metadata does not match the proof hash."}</p></div></div> : <p className="mt-4 text-sm text-text-low">Select a proof after one is generated.</p>}
      </aside>
    </div>
  </div>;
}

function short(value: string) { return `${value.slice(0, 10)}…${value.slice(-8)}`; }
function Chip({ label, active }: { label: string; active?: boolean }) { return <span className={active ? "rounded-pill border border-green-400/35 bg-green-400/10 px-3 py-1 text-green-400" : "rounded-pill border border-border-subtle bg-surface-2 px-3 py-1 text-text-mid"}>{label}</span>; }
function Line({ label, value, copy }: { label: string; value: string; copy?: boolean }) { return <div className="space-y-1"><p className="text-xs uppercase tracking-[0.12em] text-text-low">{label}</p><p className="break-all font-mono text-text-hi">{value} {copy ? <CopyButton value={value}/> : null}</p></div>; }
