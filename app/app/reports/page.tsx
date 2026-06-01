import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { DegradedNotice, EmptyReportsState } from "@/components/archon";

export const dynamic = "force-dynamic";

type ReportRow = { id: string; contractName: string; riskScore: number; createdAt: string; proofTx: string | null };

function riskTone(score: number) {
  if (score >= 85) return "text-danger";
  if (score >= 65) return "text-high";
  if (score >= 40) return "text-warning";
  return "text-success";
}

export default async function ReportsIndexPage() {
  let reports: ReportRow[] = [];
  let degraded = false;
  try {
    const result = await db.query<ReportRow>(
      `select r.id, r.contract_name as "contractName", r.risk_score as "riskScore", r.created_at as "createdAt", p.tx_hash as "proofTx"
         from reports r left join proofs p on p.report_id = r.id
        order by r.created_at desc limit 50`,
    );
    reports = result.rows;
  } catch (error) {
    degraded = true;
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "reports index fetch failed; rendering degraded state");
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.14em] text-green-400">Reports</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Audit reports</h1>
        <p className="mt-2 text-text-mid">Every assembled report for this workspace. Open one for findings, generated tests, and proof status.</p>
      </header>

      {degraded ? <DegradedNotice resource="Report history" /> : null}

      {reports.length ? (
        <section className="overflow-x-auto rounded-card border border-border-subtle bg-surface-1">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-text-low">
              <tr><th className="p-3">Contract</th><th className="p-3">Risk</th><th className="p-3">Proof</th><th className="p-3">Created</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-t border-border-subtle transition-colors hover:bg-surface-2">
                  <td className="p-3 font-medium text-text-hi">{r.contractName}</td>
                  <td className={`p-3 font-mono ${riskTone(r.riskScore)}`}>{r.riskScore}</td>
                  <td className="p-3">{r.proofTx ? <span className="rounded-pill border border-success/30 bg-success/10 px-2 py-1 text-xs text-success">Logged</span> : <span className="rounded-pill border border-border-subtle bg-surface-2 px-2 py-1 text-xs text-text-low">Pending</span>}</td>
                  <td className="p-3 text-text-low">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</td>
                  <td className="p-3 text-right"><Link href={`/app/reports/${r.id}`} className="inline-flex items-center gap-1 text-green-400 hover:text-green-300">Open <ArrowUpRight size={14} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : !degraded ? (
        <EmptyReportsState />
      ) : null}
    </div>
  );
}
