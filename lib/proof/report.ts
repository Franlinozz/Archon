import { db } from "@/lib/db/client";
import { deterministicReportHash } from "./canonical";
import { pinProofMetadata } from "./ipfs";
import { backupArtifactToCos, cosConfigured } from "@/lib/storage/cos";
import { erc8004Addresses, hasVerifiedErc8004Config } from "@/lib/chain/mantle";

type ReportRow = {
  id: string;
  scan_id: string;
  contract_name: string;
  risk_score: number;
  severity_counts: Record<string, number>;
  scope: Record<string, unknown> | null;
  executive_summary: string | null;
  created_at: Date;
};

type FindingRow = { id: string; severity: string; category: string; title: string; file: string; line_start: number | null; line_end: number | null };

export async function buildProofMetadata(reportId: string) {
  const reportResult = await db.query<ReportRow>("select * from reports where id = $1", [reportId]);
  const report = reportResult.rows[0];
  if (!report) throw new Error("Report not found");
  const findings = await db.query<FindingRow>(
    "select id,severity,category,title,file,line_start,line_end from findings where report_id=$1 order by sort_index nulls last,id",
    [reportId],
  );
  const config = erc8004Addresses();
  return {
    schema: "archon.proof.metadata.v1",
    product: "Archon",
    chain: { name: "Mantle Mainnet", chainId: 5000 },
    erc8004: {
      identityRegistry: config.identityRegistry ?? null,
      reputationRegistry: config.reputationRegistry ?? null,
      validationRegistry: config.validationRegistry ?? null,
      agentIdentityRef: config.agentIdentityRef ?? null,
      verifiedConfig: hasVerifiedErc8004Config(),
    },
    report: {
      id: report.id,
      scanId: report.scan_id,
      contractName: report.contract_name,
      riskScore: report.risk_score,
      severityCounts: report.severity_counts,
      scope: report.scope,
      executiveSummary: report.executive_summary,
      createdAt: report.created_at.toISOString(),
    },
    findings: findings.rows.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
      location: { file: finding.file, lineStart: finding.line_start, lineEnd: finding.line_end },
    })),
  };
}

export async function prepareProof(reportId: string) {
  const metadata = await buildProofMetadata(reportId);
  const reportHash = deterministicReportHash(metadata);
  const configured = hasVerifiedErc8004Config();
  const pin = await pinProofMetadata(metadata);
  // Optional Tencent COS backup of the proof artifact — best-effort, non-fatal,
  // inert until COS credentials exist (R3.1 cloud-provider layer).
  const cosBackup = cosConfigured() ? await backupArtifactToCos(`proofs/${reportId}.json`, metadata) : null;
  const fallbackBaseUrl = process.env.ARCHON_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://archonaudit.xyz";
  const metadataUri = pin.pinned ? pin.uri : `${fallbackBaseUrl.replace(/\/$/, "")}/api/reports/${reportId}/proof/metadata`;
  return {
    reportHash,
    metadata,
    metadataUri,
    ipfs: pin,
    cosBackup,
    network: "mantle-mainnet",
    chainId: 5000,
    configured,
    blocker: configured ? null : "ERC-8004 registry addresses / agent identity are not configured and verified. On-chain proof writes are disabled until Francis confirms live addresses/ABIs and approves the transaction path.",
  };
}

export async function upsertPreparedProof(reportId: string) {
  // FREEZE (V5.1 root-cause fix): the report hash is a cryptographic commitment.
  // Once a proof row has committed a hash, reuse it verbatim and NEVER re-derive
  // it from live metadata. Re-deriving here meant any later display-field edit
  // (e.g. a contract_name repair) silently changed the hash, so a verifier
  // searching for the new hash failed with "No AuditProofLogged event found"
  // even though the original hash was validly anchored on-chain.
  const existing = (await db.query<{ id: string; report_hash: string | null; metadata_uri: string; metadata: Record<string, unknown> }>(
    "select id, report_hash, metadata_uri, metadata from proofs where report_id=$1", [reportId])).rows[0];
  if (existing?.report_hash) {
    const configured = hasVerifiedErc8004Config();
    return {
      proofId: existing.id, reportHash: existing.report_hash, metadata: existing.metadata, metadataUri: existing.metadata_uri,
      ipfs: null, cosBackup: null, network: "mantle-mainnet", chainId: 5000, configured,
      blocker: configured ? null : "ERC-8004 registry addresses / agent identity are not configured and verified.",
      frozen: true,
    };
  }

  // First preparation for this report — compute, pin, and commit the hash once.
  const prepared = await prepareProof(reportId);
  const result = await db.query<{ id: string }>(
    `insert into proofs (report_id, report_hash, metadata_uri, metadata, network, logged_at, verification_status, erc8004_ref)
     values ($1,$2,$3,$4::jsonb,$5,now(),'prepared',$6::jsonb)
     on conflict (report_id) do update set metadata_uri=excluded.metadata_uri, erc8004_ref=excluded.erc8004_ref
     returning id`,
    [reportId, prepared.reportHash, prepared.metadataUri, JSON.stringify(prepared.metadata), prepared.network, JSON.stringify(prepared.metadata.erc8004)],
  );
  return { ...prepared, proofId: result.rows[0]!.id, frozen: false };
}
