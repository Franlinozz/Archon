import { isAddress, type Address } from "viem";
import { db } from "@/lib/db/client";
import { freshness } from "@/lib/sentinel/service";

// Address intelligence (F7): the public security profile of any Mantle contract,
// assembled entirely from Archon's stored evidence — no per-view RPC, so pages
// are static-cacheable and every address is a permanent, indexable URL.

export type AddressReport = { reportId: string; riskScore: number; createdAt: string; contractName: string; anchored: boolean; proofTx: string | null; severity: Record<string, number> };
export type AddressProfile = {
  address: string;
  known: boolean;
  contractName: string | null;
  latestRisk: number | null;
  freshness: { level: string; reason: string; days?: number };
  attestation: { matchType: string; attestationId: string } | null;
  monitored: boolean;
  lastDriftAt: string | null;
  reports: AddressReport[];
  gas: { gasReportId: string; l2WeiPerCall: string | null; daWeiPerCall: string | null; sourceKind: string } | null;
  challenges: { id: string; title: string; status: string; createdAt: string }[];
  openCritical: number;
  openHigh: number;
};

export async function getAddressProfile(addressRaw: string): Promise<AddressProfile | null> {
  if (!isAddress(addressRaw)) return null;
  const addr = addressRaw.toLowerCase() as Address;

  const [reportsRes, attRes, watchRes, gasRes] = await Promise.all([
    db.query<{ report_id: string; risk_score: number; created_at: string; contract_name: string; severity_counts: Record<string, number> | null; tx_hash: string | null }>(
      `select r.id as report_id, r.risk_score, r.created_at, r.contract_name, r.severity_counts,
              (select p.tx_hash from proofs p where p.report_id = r.id and p.tx_hash is not null order by p.logged_at desc limit 1) as tx_hash
         from reports r join scans s on s.id = r.scan_id
        where s.source_kind = 'address' and lower(s.source_ref) = $1
        order by r.created_at desc limit 25`, [addr]),
    db.query<{ id: string; match_type: string }>(
      `select id, match_type from attestations where lower(address)=$1 and status='done' and match_type in ('exact','partial-metadata') order by created_at desc limit 1`, [addr]),
    db.query<{ last_drift_at: string | null; source_verified: boolean }>(
      `select last_drift_at, source_verified from sentinel_watches where lower(address)=$1 and status='active' order by last_drift_at desc nulls last limit 1`, [addr]),
    db.query<{ id: string; totals: { split?: { l2WeiPerCall?: string; l1DaWeiPerCall?: string } } | null; source_kind: string }>(
      `select id, totals, source_kind from gas_reports where lower(source_ref)=$1 and status='done' order by finished_at desc nulls last limit 1`, [addr]),
  ]);

  const reports = reportsRes.rows;
  if (!reports.length && !attRes.rows.length && !watchRes.rows.length && !gasRes.rows.length) {
    return { address: addr, known: false, contractName: null, latestRisk: null, freshness: freshness({ lastReportAt: null, anchored: false, driftsSinceReport: 0, critHigh: 0 }), attestation: null, monitored: false, lastDriftAt: null, reports: [], gas: null, challenges: [], openCritical: 0, openHigh: 0 };
  }

  const latest = reports[0] ?? null;
  const counts = latest?.severity_counts ?? {};
  const openCritical = Number(counts.critical ?? 0);
  const openHigh = Number(counts.high ?? 0);
  const lastDriftAt = watchRes.rows[0]?.last_drift_at ?? null;
  const driftsSinceReport = latest && lastDriftAt && new Date(lastDriftAt) > new Date(latest.created_at) ? 1 : 0;

  const challenges = latest
    ? (await db.query<{ id: string; title: string; status: string; created_at: string }>(
        `select c.id, c.title, c.status, c.created_at from report_challenges c where c.report_id = any($1::uuid[]) order by c.created_at desc limit 10`,
        [reports.map((r) => r.report_id)],
      )).rows
    : [];

  const gasRow = gasRes.rows[0];
  return {
    address: addr,
    known: true,
    contractName: latest?.contract_name ?? null,
    latestRisk: latest?.risk_score ?? null,
    freshness: freshness({ lastReportAt: latest?.created_at ?? null, anchored: Boolean(latest?.tx_hash), driftsSinceReport, critHigh: openCritical + openHigh }),
    attestation: attRes.rows[0] ? { matchType: attRes.rows[0].match_type, attestationId: attRes.rows[0].id } : null,
    monitored: watchRes.rows.length > 0,
    lastDriftAt,
    reports: reports.map((r) => ({ reportId: r.report_id, riskScore: r.risk_score, createdAt: r.created_at, contractName: r.contract_name, anchored: Boolean(r.tx_hash), proofTx: r.tx_hash, severity: r.severity_counts ?? {} })),
    gas: gasRow ? { gasReportId: gasRow.id, l2WeiPerCall: gasRow.totals?.split?.l2WeiPerCall ?? null, daWeiPerCall: gasRow.totals?.split?.l1DaWeiPerCall ?? null, sourceKind: gasRow.source_kind } : null,
    challenges: challenges.map((c) => ({ id: c.id, title: c.title, status: c.status, createdAt: c.created_at })),
    openCritical,
    openHigh,
  };
}

/** Addresses Archon has any public evidence for — powers the sitemap. */
export async function knownAddresses(limit = 1000): Promise<string[]> {
  const rows = (await db.query<{ addr: string }>(
    `select distinct addr from (
       select lower(s.source_ref) as addr from scans s where s.source_kind='address' and s.source_ref is not null
       union select lower(address) from attestations
       union select lower(source_ref) from gas_reports where source_ref ~* '^0x[0-9a-f]{40}$'
     ) a where addr ~* '^0x[0-9a-f]{40}$' limit $1`, [limit])).rows;
  return rows.map((r) => r.addr);
}
