import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Archon — Public proof verification",
  description: "Independently re-check Archon audit proofs anchored on Mantle Mainnet. No wallet required.",
};

type ProofRow = { reportId: string; contractName: string; riskScore: number; reportHash: string; txHash: string | null; loggedAt: string | null; sourceHash: string | null };

function short(v: string) { return v.length > 18 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v; }

// PUBLIC, read-only proof verification surface (no wallet, no gate) — anyone,
// including a judge, can confirm a real on-chain proof exists and open the
// independent verifier at /r/[reportId].
export default async function PublicProofsPage() {
  let rows: ProofRow[] = [];
  let degraded = false;
  try {
    const result = await db.query<ProofRow>(
      `with ranked as (
         select p.report_id as "reportId", r.contract_name as "contractName", r.risk_score as "riskScore", p.report_hash as "reportHash", p.tx_hash as "txHash", p.logged_at as "loggedAt", encode(digest(coalesce(s.source_code,''), 'sha256'), 'hex') as "sourceHash",
                row_number() over (partition by encode(digest(coalesce(s.source_code,''), 'sha256'), 'hex') order by p.logged_at desc nulls last, r.risk_score desc, r.created_at desc) as rn
           from proofs p join reports r on r.id = p.report_id join scans s on s.id = r.scan_id
          where p.tx_hash is not null
       )
       select "reportId", "contractName", "riskScore", "reportHash", "txHash", "loggedAt", "sourceHash" from ranked where rn=1 order by "loggedAt" desc nulls last limit 50`,
    );
    rows = result.rows;
  } catch (error) {
    degraded = true;
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "public proofs page fetch failed");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-brand-500">Trustless · anyone can re-check</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight text-ink">On-chain proof verification</h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-body">
        Every anchored Archon report yields a deterministic hash, IPFS metadata, and an ERC-8004 Reputation entry on Mantle Mainnet. Open any proof below to re-derive the hash and confirm the on-chain record yourself — no wallet needed.
      </p>

      {degraded ? (
        <p className="mt-8 rounded-card border border-warning/30 bg-warning/10 p-4 text-sm text-warning">Proof records are temporarily unavailable — please retry shortly.</p>
      ) : rows.length ? (
        <div className="mt-8 overflow-x-auto rounded-card border border-border-subtle bg-surface-1 shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-text-low">
              <tr><th className="p-3">Contract</th><th className="p-3">Risk</th><th className="p-3">Report hash</th><th className="p-3">Anchored</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.reportId} className="border-t border-border-subtle transition-colors hover:bg-surface-2">
                  <td className="p-3 font-medium text-text-hi">{r.contractName}</td>
                  <td className="p-3 font-mono text-warning">{r.riskScore}</td>
                  <td className="p-3 font-mono text-text-mid">{short(r.reportHash)}</td>
                  <td className="p-3 text-text-low">{r.loggedAt ? new Date(r.loggedAt).toLocaleDateString() : "—"}</td>
                  <td className="p-3 text-right"><Link href={`/r/${r.reportId}`} className="inline-flex items-center gap-1 text-green-400 hover:text-green-300">Verify <ArrowUpRight size={14} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-8 rounded-card border border-border-subtle bg-surface-1 p-6 text-text-mid">No anchored proofs yet.</p>
      )}

      <p className="mt-6 inline-flex items-center gap-2 text-sm text-text-low"><ShieldCheck size={15} className="text-success" /> Reports are risk intelligence with confidence scores, not guarantees or certifications.</p>
    </main>
  );
}
