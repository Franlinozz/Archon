import "dotenv/config";
import { db, closeDb } from "@/lib/db/client";
import { deriveContractName, sourceShortHash } from "@/lib/source/names";

type AuditRow = { reportId: string; scanId: string; sourceCode: string; sourceRef: string | null; sourceKind: string | null; currentName: string | null };
type GasRow = { id: string; sourceCode: string; sourceRef: string | null; sourceKind: string | null; currentName: string | null; sourceHash: string | null };

const assignedByTable = new Map<string, Map<string, string>>();

function uniqueName(table: string, base: string, sourceHash: string) {
  const assigned = assignedByTable.get(table) ?? new Map<string, string>();
  assignedByTable.set(table, assigned);
  const existingHash = assigned.get(base);
  if (!existingHash || existingHash === sourceHash) {
    assigned.set(base, sourceHash);
    return base;
  }
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}_${i}`;
    const candidateHash = assigned.get(candidate);
    if (!candidateHash || candidateHash === sourceHash) {
      assigned.set(candidate, sourceHash);
      return candidate;
    }
  }
  return `${base}_${sourceHash.slice(0, 4)}`;
}

async function repairAuditReports() {
  const rows = (await db.query<AuditRow>(
    `select r.id as "reportId", s.id as "scanId", coalesce(s.source_code,'') as "sourceCode", s.source_ref as "sourceRef", s.source_kind as "sourceKind", r.contract_name as "currentName"
       from reports r join scans s on s.id = r.scan_id
      order by r.created_at asc`,
  )).rows;
  let changed = 0;
  for (const row of rows) {
    const label = row.sourceKind === "paste" ? row.sourceRef : null;
    const sourceHash = sourceShortHash(row.sourceCode);
    const next = uniqueName("reports", deriveContractName(row.sourceCode, { label, sourceHash }), sourceHash);
    if (next === row.currentName) continue;
    await db.query("update reports set contract_name=$2 where id=$1", [row.reportId, next]);
    changed += 1;
  }
  return { scanned: rows.length, changed };
}

async function repairGasReports() {
  const rows = (await db.query<GasRow>(
    `select id, coalesce(source_code,'') as "sourceCode", source_ref as "sourceRef", source_kind as "sourceKind", contract_name as "currentName", source_hash as "sourceHash"
       from gas_reports
      order by created_at asc`,
  )).rows;
  let changed = 0;
  for (const row of rows) {
    const label = row.sourceKind === "paste" ? row.sourceRef : null;
    const sourceHash = (row.sourceHash ?? sourceShortHash(row.sourceCode)).replace(/^0x/, "").slice(0, 8);
    const next = uniqueName("gas_reports", deriveContractName(row.sourceCode, { label, sourceHash }), sourceHash);
    if (next === row.currentName) continue;
    await db.query("update gas_reports set contract_name=$2 where id=$1", [row.id, next]);
    changed += 1;
  }
  return { scanned: rows.length, changed };
}

try {
  const [reports, gasReports] = await Promise.all([repairAuditReports(), repairGasReports()]);
  console.log(JSON.stringify({ ok: true, reports, gasReports }, null, 2));
} finally {
  await closeDb();
}
