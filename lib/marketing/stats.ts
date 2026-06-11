import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";

// Real production numbers for the public landing page. Every value here comes
// straight from the database — if the query fails the caller hides the section
// instead of rendering placeholder/fake figures (nothing-fake rule).

export type SeverityCounts = { critical: number; high: number; medium: number; low: number; info: number };

export type LandingProof = {
  reportId: string;
  contractName: string;
  riskScore: number;
  reportHash: string;
  txHash: string;
  loggedAt: string | null;
};

export type LandingStats = {
  reportsAnchored: number;
  findingsDetected: number;
  scansCompleted: number;
  optimizationsSurfaced: number;
  severity: SeverityCounts;
  /** Aggregate per-call fee split across completed gas reports (wei, receipt-calibrated). */
  daSplit: { l2Wei: bigint; daWei: bigint; reportCount: number } | null;
  latestProof: LandingProof | null;
};

const EMPTY_SEVERITY: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

export async function getLandingStats(): Promise<LandingStats | null> {
  try {
    const [counts, severityRows, splitRows, proofRows] = await Promise.all([
      db.query<{ anchored: number; findings: number; scans: number; optimizations: number }>(
        `select
           (select count(*) from proofs where verification_status='proof_logged' and tx_hash is not null)::int as anchored,
           (select count(*) from findings)::int as findings,
           (select count(*) from scans where status='done')::int as scans,
           (select count(*) from gas_optimizations)::int as optimizations`,
      ),
      db.query<{ severity: string; n: number }>(`select severity, count(*)::int as n from findings group by severity`),
      db.query<{ l2: string | null; da: string | null; n: number }>(
        `select sum((totals->'split'->>'l2WeiPerCall')::numeric)::text as l2,
                sum((totals->'split'->>'l1DaWeiPerCall')::numeric)::text as da,
                count(*)::int as n
           from gas_reports where status='done' and totals->'split'->>'l2WeiPerCall' is not null`,
      ),
      db.query<LandingProof>(
        `select p.report_id as "reportId", r.contract_name as "contractName", r.risk_score as "riskScore", p.report_hash as "reportHash", p.tx_hash as "txHash", p.logged_at as "loggedAt"
           from proofs p join reports r on r.id = p.report_id
          where p.verification_status='proof_logged' and p.tx_hash is not null
          order by p.logged_at desc nulls last, p.created_at desc limit 1`,
      ),
    ]);

    const severity = { ...EMPTY_SEVERITY };
    for (const row of severityRows.rows) {
      if (row.severity in severity) severity[row.severity as keyof SeverityCounts] = row.n;
    }

    const split = splitRows.rows[0];
    const daSplit = split?.l2 && split.n > 0 ? { l2Wei: BigInt(split.l2.split(".")[0] ?? "0"), daWei: BigInt((split.da ?? "0").split(".")[0] ?? "0"), reportCount: split.n } : null;
    const c = counts.rows[0];

    return {
      reportsAnchored: c?.anchored ?? 0,
      findingsDetected: c?.findings ?? 0,
      scansCompleted: c?.scans ?? 0,
      optimizationsSurfaced: c?.optimizations ?? 0,
      severity,
      daSplit,
      latestProof: proofRows.rows[0] ?? null,
    };
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "landing stats unavailable; rendering static landing");
    return null;
  }
}

/** "0xb1fc5c02…cae8a01" — short display form for hashes/addresses. */
export function shortHash(value: string, head = 10, tail = 6): string {
  return value.length > head + tail + 2 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

/** DA share of the aggregate per-call fee as a display string; never overstates precision. */
export function daShareLabel(split: { l2Wei: bigint; daWei: bigint }): { da: string; l2: string; daFraction: number } {
  const total = split.l2Wei + split.daWei;
  if (total === 0n) return { da: "0%", l2: "0%", daFraction: 0 };
  // basis points ×100 (precision to 0.0001%) is plenty for display
  const daBp = Number((split.daWei * 1_000_000n) / total) / 10_000;
  if (daBp < 0.01) return { da: "<0.01%", l2: "99.99%+", daFraction: daBp / 100 };
  return { da: `${daBp.toFixed(2)}%`, l2: `${(100 - daBp).toFixed(2)}%`, daFraction: daBp / 100 };
}
