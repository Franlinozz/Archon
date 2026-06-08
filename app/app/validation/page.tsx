import Link from "next/link";
import { ShieldQuestion } from "lucide-react";
import { db } from "@/lib/db/client";

export default async function ValidationPage() {
  let challenges: Array<{ id: string; title: string; targetType: string; status: string; challengeHash: string; createdAt: string; reportId: string | null; gasReportId: string | null }> = [];
  let degraded = false;
  try {
    challenges = (await db.query(
      `select id, title, target_type as "targetType", status, challenge_hash as "challengeHash", created_at as "createdAt", report_id as "reportId", gas_report_id as "gasReportId"
       from report_challenges order by created_at desc limit 12`,
    )).rows;
  } catch {
    degraded = true;
  }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-green-400">Validation</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Public challenge ledger</h1>
        <p className="mt-2 max-w-3xl text-text-mid">Archon records scoped challenges against audit reports, findings, gas reports, and optimizations. Each challenge gets a deterministic hash and references any existing ArchonProofRegistry proof or gas anchor already tied to the artifact.</p>
      </div>
      <span className="rounded-pill border border-success/30 bg-success/10 px-3 py-1 text-sm text-success">DB-backed · no new contract</span>
    </header>

    {degraded ? <p className="rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">Challenge ledger is temporarily unavailable because the database could not be reached.</p> : null}

    <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-text-hi"><ShieldQuestion className="text-green-400"/> How validation works now</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Step title="1 · Challenge a specific artifact" body="Use the challenge panel on a private report, public proof report, or gas report. The form requires a title, rationale, and optional evidence URL." />
        <Step title="2 · Record immutable context" body="Archon stores the challenge in Supabase with target IDs, status, evidence, and a canonical SHA-256 challenge hash." />
        <Step title="3 · Reference existing proof" body="If the report already has an ArchonProofRegistry tx/hash or gas anchor, the challenge keeps that reference. No new contract is deployed under deadline." />
      </div>
    </section>

    <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
      <h2 className="text-xl font-semibold text-text-hi">Recent challenges</h2>
      <div className="mt-4 space-y-3">
        {challenges.map((challenge) => <Link key={challenge.id} href={challenge.reportId ? `/r/${challenge.reportId}` : `/app/gas/${challenge.gasReportId}`} className="block rounded-card border border-border-subtle bg-surface-2 p-4 hover:border-green-400/40">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-text-hi">{challenge.title}</p><p className="mt-1 text-xs text-text-low">{challenge.targetType} · {challenge.status} · {new Date(challenge.createdAt).toLocaleString()}</p></div><span className="rounded-pill border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning">Challenge</span></div>
          <p className="mt-2 break-all font-mono text-xs text-text-low">{challenge.challengeHash}</p>
        </Link>)}
        {!challenges.length ? <p className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-low">No challenges have been recorded yet. Open a report or gas report and use “Challenge this report”.</p> : null}
      </div>
    </section>
  </div>;
}

function Step({ title, body }: { title: string; body: string }) {
  return <section className="rounded-card border border-border-subtle bg-terminal p-4"><h3 className="text-base font-semibold text-text-hi">{title}</h3><p className="mt-2 text-sm leading-6 text-text-mid">{body}</p></section>;
}
