import { privateKeyToAccount } from "viem/accounts";
import { isAddress, type Address } from "viem";
import { db } from "@/lib/db/client";
import { canonicalize } from "@/lib/proof/canonical";
import { freshness } from "@/lib/sentinel/service";

// Agent Trust API (F6): the "can my agent trust this contract?" primitive.
// A compact, EIP-191-signed verdict so any consumer can verify provenance
// offline — the signature recovers to Archon's ERC-8004 Agent #97 owner key.
// Risk intelligence with provenance, NOT a safety guarantee (same boundary as
// everywhere else in Archon).

export const ARCHON_AGENT_ID = 97;
export const VERDICT_SCHEMA = "archon.verdict.v1";

export type Verdict = {
  schema: typeof VERDICT_SCHEMA;
  address: string;
  chainId: number;
  network: string;
  riskScore: number | null;
  openCritical: number;
  openHigh: number;
  lastAuditAt: string | null;
  auditFreshness: string;
  attestation: string; // "exact" | "partial-metadata" | "none"
  proofTx: string | null;
  reportUrl: string | null;
  agentId: number;
  signer: string;
  generatedAt: string;
  disclaimer: string;
};

export type SignedVerdict = Verdict & { signature: string; canonical: string };

function signerAccount() {
  const key = process.env.ARCHON_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) return null;
  return privateKeyToAccount(key);
}

export function verdictSignerAddress(): string | null {
  return signerAccount()?.address ?? null;
}

/** Build the unsigned verdict for an address from Archon's stored evidence. */
export async function buildVerdict(chainId: number, address: string): Promise<Verdict | { error: string }> {
  if (!isAddress(address)) return { error: "Invalid address." };
  if (chainId !== 5000) return { error: "Only Mantle Mainnet (chainId 5000) is supported." };
  const addr = address.toLowerCase() as Address;

  // Latest completed report for an address scan of this contract.
  const report = (await db.query<{ id: string; risk_score: number; severity_counts: Record<string, number> | null; created_at: string }>(
    `select r.id, r.risk_score, r.severity_counts, r.created_at
       from reports r join scans s on s.id = r.scan_id
      where s.source_kind = 'address' and lower(s.source_ref) = $1
      order by r.created_at desc limit 1`,
    [addr],
  )).rows[0] ?? null;

  // Attestation is independent of whether an Archon audit exists — a deployed
  // contract can be build-attested without a scan. Proof/anchor depend on the report.
  const [attestation, proof] = await Promise.all([
    db.query<{ match_type: string }>(`select match_type from attestations where lower(address)=$1 and status='done' and match_type in ('exact','partial-metadata') order by created_at desc limit 1`, [addr]),
    report
      ? db.query<{ tx_hash: string }>(`select tx_hash from proofs where report_id=$1 and tx_hash is not null order by logged_at desc limit 1`, [report.id])
      : Promise.resolve({ rows: [] as { tx_hash: string }[] }),
  ]);
  const anchored = proof.rows.length > 0;

  const counts = report?.severity_counts ?? {};
  const openCritical = Number(counts.critical ?? 0);
  const openHigh = Number(counts.high ?? 0);
  const fresh = freshness({
    lastReportAt: report?.created_at ?? null,
    anchored,
    driftsSinceReport: 0,
    critHigh: openCritical + openHigh,
  });

  const base = process.env.ARCHON_PUBLIC_BASE_URL ?? "https://archonaudit.xyz";
  return {
    schema: VERDICT_SCHEMA,
    address: addr,
    chainId,
    network: "mantle-mainnet",
    riskScore: report?.risk_score ?? null,
    openCritical,
    openHigh,
    lastAuditAt: report?.created_at ?? null,
    auditFreshness: fresh.level,
    attestation: attestation.rows[0]?.match_type ?? "none",
    proofTx: proof.rows[0]?.tx_hash ?? null,
    reportUrl: report ? `${base}/r/${report.id}` : null,
    agentId: ARCHON_AGENT_ID,
    signer: signerAccount()?.address ?? "0x0000000000000000000000000000000000000000",
    generatedAt: new Date().toISOString(),
    disclaimer: "Risk intelligence with provenance, not a safety guarantee. Re-verify independently before trusting funds.",
  };
}

/**
 * Sign the verdict: EIP-191 personal_sign over the canonical JSON of the verdict
 * object (deterministic key ordering via canonicalize()). Consumers verify with
 * viem verifyMessage({ address: verdict.signer, message: verdict.canonical,
 * signature }) — recovers to Agent #97's owner address, offline.
 */
export async function signVerdict(verdict: Verdict): Promise<SignedVerdict | null> {
  const account = signerAccount();
  if (!account) return null;
  const canonical = canonicalize(verdict);
  const signature = await account.signMessage({ message: canonical });
  return { ...verdict, canonical, signature };
}
