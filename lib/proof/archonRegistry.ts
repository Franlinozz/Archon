import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http, isAddress, parseAbiItem, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";
import archonProofRegistryAbi from "@/lib/chain/abis/ArchonProofRegistry.json";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { upsertPreparedProof } from "./report";
import { appendReputationFeedback } from "./reputation";

// Best-effort ERC-8004 Reputation Registry feedback, AFTER the primary registry
// anchor and **fire-and-forget** so the second on-chain tx's latency never blocks
// the anchor response (the proof is already recorded). appendReputationFeedback is
// idempotent per report, so this also runs on the already-anchored path to backfill
// a missing entry without ever double-writing. Completes on Archon's persistent VM.
function kickReputation(reportId: string): void {
  void appendReputationFeedback(reportId)
    .then((r) => ("ok" in r
      ? logger.info({ reportId, tx: r.txHash, idx: r.feedbackIndex }, "ERC-8004 reputation feedback appended")
      : logger.info({ reportId, reason: r.reason }, "ERC-8004 reputation feedback skipped")))
    .catch((error) => logger.warn({ reportId, err: error instanceof Error ? error.message : String(error) }, "ERC-8004 reputation feedback failed"));
}

// Session 15: Archon's OWN deployed contract (ArchonProofRegistry) is the primary,
// award-eligible anchor. logAuditProof is permissionless (no self-feedback rule) and
// idempotent per report hash, so both gasless (owner wallet) and self-custody (user
// wallet) work. Gated behind NEXT_PUBLIC_ARCHON_PROOF_REGISTRY — until that's set
// (post-deploy), the proof route falls back to the Identity-attestation path.

type Prepared = Awaited<ReturnType<typeof upsertPreparedProof>>;
const chain = { ...mantle, id: 5000 } as const;
const rpc = () => process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";

const PROOF_LOGGED_EVENT = parseAbiItem(
  "event AuditProofLogged(bytes32 indexed reportHash, address indexed loggedBy, uint256 indexed agentId, uint8 riskScore, string metadataURI, uint64 timestamp)",
);

export function proofRegistryAddress(): Address | null {
  const a = process.env.NEXT_PUBLIC_ARCHON_PROOF_REGISTRY;
  return a && isAddress(a) ? (a as Address) : null;
}
export function isProofRegistryConfigured(): boolean {
  return proofRegistryAddress() !== null;
}

function agentIdNum(): bigint {
  const ref = process.env.ARCHON_AGENT_IDENTITY_REF ?? "";
  const t = ref.split(":").at(-1);
  return t && /^\d+$/.test(t) ? BigInt(t) : 0n;
}

function riskFromMetadata(prepared: Prepared): number {
  const m = prepared.metadata as { report?: { riskScore?: number } };
  const r = Math.round(m.report?.riskScore ?? 0);
  return Math.max(0, Math.min(255, r));
}

/** Public params so a self-custody wallet can submit the identical logAuditProof. */
export function archonProofParams(prepared: Prepared) {
  const registry = proofRegistryAddress();
  if (!registry) throw new Error("ARCHON_PROOF_REGISTRY not configured.");
  return {
    mechanism: "archon-registry" as const,
    registry,
    reportHash: prepared.reportHash as `0x${string}`,
    metadataURI: prepared.metadataUri,
    riskScore: riskFromMetadata(prepared),
    agentId: agentIdNum().toString(),
  };
}

function publicClient() {
  return createPublicClient({ chain, transport: http(rpc()) });
}

// Read-before-write duplicate guard via the contract's isAnchored().
async function alreadyAnchored(reportId: string, prepared: Prepared) {
  const registry = proofRegistryAddress();
  if (!registry) return null;
  const anchored = (await publicClient().readContract({ address: registry, abi: archonProofRegistryAbi, functionName: "isAnchored", args: [prepared.reportHash as `0x${string}`] }).catch(() => false)) as boolean;
  if (!anchored) return null;
  const row = await db.query<{ txHash: string | null }>(`select tx_hash as "txHash" from proofs where report_id=$1`, [reportId]).catch(() => null);
  return { txHash: row?.rows[0]?.txHash ?? null };
}

// GASLESS: Archon's server (the funded owner wallet) anchors. Simulate first,
// bounded receipt wait — never silently hangs.
export async function logPreparedProofOnArchonRegistry(reportId: string) {
  const registry = proofRegistryAddress();
  if (!registry) throw new Error("ARCHON_PROOF_REGISTRY not configured.");
  const ownerKey = process.env.ARCHON_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!ownerKey) throw new Error("ARCHON_WALLET_PRIVATE_KEY must be configured.");
  const prepared = await upsertPreparedProof(reportId);

  const dup = await alreadyAnchored(reportId, prepared);
  if (dup) {
    kickReputation(reportId); // backfill a missing reputation entry (idempotent); never re-anchors
    return { reportId, proofId: prepared.proofId, alreadyAnchored: true, txHash: dup.txHash, reportHash: prepared.reportHash, metadataUri: prepared.metadataUri, explorer: dup.txHash ? `https://mantlescan.xyz/tx/${dup.txHash}` : null };
  }

  const account = privateKeyToAccount(ownerKey);
  const pc = publicClient();
  const wc = createWalletClient({ account, chain, transport: http(rpc()) });
  const args = [prepared.reportHash as `0x${string}`, prepared.metadataUri, riskFromMetadata(prepared), agentIdNum()] as const;

  await pc.simulateContract({ account: account.address, address: registry, abi: archonProofRegistryAbi, functionName: "logAuditProof", args });
  const gas = await pc.estimateContractGas({ account: account.address, address: registry, abi: archonProofRegistryAbi, functionName: "logAuditProof", args });
  const gasPrice = await pc.getGasPrice();
  const balance = await pc.getBalance({ address: account.address });
  if (balance < gas * gasPrice) throw new Error(`Archon's signer wallet has insufficient MNT. Need ${formatEther(gas * gasPrice)}, balance ${formatEther(balance)}.`);

  const data = encodeFunctionData({ abi: archonProofRegistryAbi, functionName: "logAuditProof", args });
  const nonce = await pc.getTransactionCount({ address: account.address, blockTag: "pending" });
  const serialized = await wc.signTransaction({ account, chain, to: registry, data, gas, gasPrice, nonce });
  const hash = await pc.sendRawTransaction({ serializedTransaction: serialized });
  const receipt = await pc.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
  if (receipt.status !== "success") throw new Error("Proof transaction reverted on-chain.");

  await recordProof(prepared.proofId, hash, prepared.metadataUri, { registry, agentId: agentIdNum(), author: account.address });
  kickReputation(reportId); // fire-and-forget; does not block the response
  return {
    reportId, proofId: prepared.proofId, txHash: hash, reportHash: prepared.reportHash, metadataUri: prepared.metadataUri,
    agentId: agentIdNum().toString(), author: account.address, loggedBy: account.address, status: receipt.status,
    gas: { used: receipt.gasUsed.toString(), actualCostMnt: formatEther(receipt.gasUsed * (receipt.effectiveGasPrice ?? gasPrice)) },
    reputation: "submitting (best-effort, async)",
    explorer: `https://mantlescan.xyz/tx/${hash}`,
  };
}

// SELF-CUSTODY: the user already submitted logAuditProof. Verify the event + hash.
export async function verifyAndRecordArchonUserProof(reportId: string, txHash: `0x${string}`, expectedAuthor?: string) {
  const registry = proofRegistryAddress();
  if (!registry) throw new Error("ARCHON_PROOF_REGISTRY not configured.");
  const prepared = await upsertPreparedProof(reportId);
  const pc = publicClient();
  const receipt = await pc.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: 90_000 });
  if (receipt.status !== "success") throw new Error("Transaction reverted on-chain.");

  // Confirm the proof is genuinely on-chain for the FROZEN report hash. Primary:
  // the AuditProofLogged event in this tx's block matching the hash. Fallback:
  // the registry's own isAnchored() view — authoritative and immune to log
  // range/indexing quirks, so a confirmed proof is never reported as missing.
  const reportHash = (prepared.reportHash as string).toLowerCase();
  // Read-back can momentarily lag the receipt on a load-balanced RPC: the block is
  // mined (receipt returned) but the replica that answers getLogs/isAnchored hasn't
  // indexed it yet. Confirm via the AuditProofLogged event first, then the
  // authoritative isAnchored() view, retrying a few times with a short wait before
  // declaring a genuine divergence — so transient lag is never mis-reported as
  // "hash not anchored". (Hash unification itself is guaranteed by the frozen
  // prepared.reportHash used for calldata AND this read-back.)
  let confirmedVia: "event" | "registry-view" | null = null;
  for (let attempt = 0; attempt < 4 && !confirmedVia; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
    const logs = await pc.getLogs({ address: registry, event: PROOF_LOGGED_EVENT, fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber }).catch(() => []);
    if (logs.find((l) => l.transactionHash.toLowerCase() === txHash.toLowerCase() && (l.args.reportHash as string)?.toLowerCase() === reportHash)) { confirmedVia = "event"; break; }
    const anchored = (await pc.readContract({ address: registry, abi: archonProofRegistryAbi, functionName: "isAnchored", args: [reportHash as `0x${string}`] }).catch(() => false)) as boolean;
    if (anchored) confirmedVia = "registry-view";
  }
  if (!confirmedVia) {
    // Tx mined but this exact report hash is not anchored after retries — an honest,
    // distinct failure from "pending" or "reverted".
    throw new Error("The transaction mined, but this report hash is not anchored in ArchonProofRegistry. Re-anchor from this report (its hash may have changed).");
  }

  const author = (receipt.from ?? "").toLowerCase();
  if (expectedAuthor && author !== expectedAuthor.toLowerCase()) throw new Error("The transaction was submitted by a different wallet than the signed-in session.");
  await recordProof(prepared.proofId, txHash, prepared.metadataUri, { registry, agentId: agentIdNum(), author });
  kickReputation(reportId); // fire-and-forget; does not block the response
  return { reportId, proofId: prepared.proofId, txHash, reportHash: prepared.reportHash, agentId: agentIdNum().toString(), author, loggedBy: author, verified: true, confirmedVia, reputation: "submitting (best-effort, async)", explorer: `https://mantlescan.xyz/tx/${txHash}` };
}

async function recordProof(proofId: string, txHash: string, metadataUri: string, ref: { registry: string; agentId: bigint; author: string }) {
  await db.query(
    `update proofs set tx_hash=$2, metadata_uri=$3, verification_status='proof_logged', logged_at=now(), erc8004_ref=$4::jsonb where id=$1`,
    [proofId, txHash, metadataUri, JSON.stringify({ mechanism: "archon-proof-registry", contract: ref.registry, agentId: ref.agentId.toString(), author: ref.author, loggedBy: ref.author })],
  );
}
