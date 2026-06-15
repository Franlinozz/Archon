import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http, isAddress, parseAbiItem, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";
import reputationRegistryAbi from "@/lib/chain/abis/ReputationRegistry.json";
import { db } from "@/lib/db/client";
import { upsertPreparedProof } from "./report";

type PreparedProof = Awaited<ReturnType<typeof upsertPreparedProof>>;

const FEEDBACK_TAG1 = "archon.audit.report";
const FEEDBACK_ENDPOINT = "https://archonaudit.xyz/app/proofs";
const NEW_FEEDBACK_EVENT = parseAbiItem(
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
);

// Single source of truth for the ERC-8004 giveFeedback parameters of a prepared
// proof. Used by the server-pay path AND surfaced to the client so a self-custody
// submission calls the exact same contract function with identical args.
export function giveFeedbackParams(prepared: PreparedProof) {
  const reputationRegistry = process.env.ERC8004_REPUTATION_REGISTRY as Address | undefined;
  const agentRef = process.env.ARCHON_AGENT_IDENTITY_REF;
  if (!reputationRegistry || !isAddress(reputationRegistry)) throw new Error("ERC8004_REPUTATION_REGISTRY must be configured.");
  if (!agentRef) throw new Error("ARCHON_AGENT_IDENTITY_REF must be configured.");
  const agentIdText = agentRef.split(":").at(-1);
  if (!agentIdText || !/^\d+$/.test(agentIdText)) throw new Error(`Could not parse agentId from ARCHON_AGENT_IDENTITY_REF=${agentRef}`);
  const agentId = BigInt(agentIdText);
  const metadata = prepared.metadata as { report?: { riskScore?: number } };
  const tag2 = `risk:${metadata.report?.riskScore ?? "unknown"}`;
  const args = [agentId, 100n, 0, FEEDBACK_TAG1, tag2, FEEDBACK_ENDPOINT, prepared.metadataUri, prepared.reportHash as `0x${string}`] as const;
  return { reputationRegistry, agentId, value: 100, valueDecimals: 0, tag1: FEEDBACK_TAG1, tag2, endpoint: FEEDBACK_ENDPOINT, args };
}

// Self-custody path: the USER's wallet already submitted giveFeedback and paid gas.
// We verify the receipt + NewFeedback event, confirm the emitted feedbackHash equals
// our computed reportHash (same verification as the server path), and persist with
// loggedBy = the user's address. Never spends Archon's wallet.
export async function verifyAndRecordUserProof(reportId: string, txHash: `0x${string}`, expectedClient?: string) {
  const rpcUrl = process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";
  const prepared = await upsertPreparedProof(reportId);
  const { reputationRegistry, agentId } = giveFeedbackParams(prepared);
  const chain = { ...mantle, id: 5000 };
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error("Transaction reverted on-chain.");

  const logs = await publicClient.getLogs({ address: reputationRegistry, event: NEW_FEEDBACK_EVENT, fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber });
  const ownLog = logs.find(
    (log) =>
      log.transactionHash.toLowerCase() === txHash.toLowerCase() &&
      log.args.agentId === agentId &&
      log.args.feedbackHash?.toLowerCase() === (prepared.reportHash as string).toLowerCase(),
  );
  if (!ownLog) throw new Error("No NewFeedback event with the expected report hash was found in this transaction.");

  const feedbackClient = (ownLog.args.clientAddress ?? "").toLowerCase();
  if (expectedClient && feedbackClient !== expectedClient.toLowerCase()) {
    throw new Error("The transaction was submitted by a different wallet than the signed-in session.");
  }
  const feedbackIndex = ownLog.args.feedbackIndex === undefined ? null : String(ownLog.args.feedbackIndex);
  const metadata = prepared.metadata as { erc8004?: Record<string, unknown> };
  await db.query(
    `update proofs set tx_hash=$2, metadata_uri=$3, verification_status='proof_logged', logged_at=now(), erc8004_ref=$4::jsonb where id=$1`,
    [prepared.proofId, txHash, prepared.metadataUri, JSON.stringify({ ...(metadata.erc8004 ?? {}), reputationRegistry, feedbackClient, feedbackIndex, loggedBy: feedbackClient, selfCustody: true })],
  );
  return {
    reportId,
    proofId: prepared.proofId,
    txHash,
    reportHash: prepared.reportHash,
    feedbackClient,
    feedbackIndex,
    verified: true,
    loggedBy: feedbackClient,
    explorer: `https://mantlescan.xyz/tx/${txHash}`,
  };
}

export async function logPreparedProofOnReputation(reportId: string) {
  const rpcUrl = process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";
  const reputationRegistry = process.env.ERC8004_REPUTATION_REGISTRY as Address | undefined;
  const clientKey = process.env.ARCHON_REPUTATION_CLIENT_PRIVATE_KEY as `0x${string}` | undefined;
  const agentRef = process.env.ARCHON_AGENT_IDENTITY_REF;
  if (!reputationRegistry || !isAddress(reputationRegistry)) throw new Error("ERC8004_REPUTATION_REGISTRY must be configured.");
  if (!clientKey) throw new Error("ARCHON_REPUTATION_CLIENT_PRIVATE_KEY must be configured.");
  if (!agentRef) throw new Error("ARCHON_AGENT_IDENTITY_REF must be configured.");
  const agentIdText = agentRef.split(":").at(-1);
  if (!agentIdText || !/^\d+$/.test(agentIdText)) throw new Error(`Could not parse agentId from ARCHON_AGENT_IDENTITY_REF=${agentRef}`);
  const agentId = BigInt(agentIdText);
  const account = privateKeyToAccount(clientKey);
  const chain = { ...mantle, id: 5000 };
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const prepared = await upsertPreparedProof(reportId);
  const metadata = prepared.metadata as { report?: { riskScore?: number }; erc8004?: Record<string, unknown> };
  const args = [
    agentId,
    100n,
    0,
    "archon.audit.report",
    `risk:${metadata.report?.riskScore ?? "unknown"}`,
    "https://archonaudit.xyz/app/proofs",
    prepared.metadataUri,
    prepared.reportHash as `0x${string}`,
  ] as const;

  await publicClient.simulateContract({ account: account.address, address: reputationRegistry, abi: reputationRegistryAbi, functionName: "giveFeedback", args });
  const gas = await publicClient.estimateContractGas({ account: account.address, address: reputationRegistry, abi: reputationRegistryAbi, functionName: "giveFeedback", args });
  const gasPrice = await publicClient.getGasPrice();
  const estimatedCostWei = gas * gasPrice;
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < estimatedCostWei) throw new Error(`Client wallet has insufficient MNT. Need ${formatEther(estimatedCostWei)}, balance ${formatEther(balance)}.`);

  const data = encodeFunctionData({ abi: reputationRegistryAbi, functionName: "giveFeedback", args });
  const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
  const serialized = await walletClient.signTransaction({ account, chain, to: reputationRegistry, data, gas, gasPrice, nonce });
  const hash = await publicClient.sendRawTransaction({ serializedTransaction: serialized });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
  const event = parseAbiItem("event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)");
  const logs = await publicClient.getLogs({ address: reputationRegistry, event, fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber });
  const ownLog = logs.find((log) => log.transactionHash.toLowerCase() === hash.toLowerCase() && log.args.clientAddress?.toLowerCase() === account.address.toLowerCase());
  const feedbackIndex = ownLog?.args.feedbackIndex === undefined ? null : String(ownLog.args.feedbackIndex);
  await db.query(
    `update proofs set tx_hash=$2, metadata_uri=$3, verification_status='proof_logged', logged_at=now(), erc8004_ref=$4::jsonb where id=$1`,
    [prepared.proofId, hash, prepared.metadataUri, JSON.stringify({ ...(metadata.erc8004 ?? {}), reputationRegistry, feedbackClient: account.address, feedbackIndex })],
  );
  const actualCostWei = receipt.gasUsed * (receipt.effectiveGasPrice ?? gasPrice);
  return {
    reportId,
    proofId: prepared.proofId,
    agentId: agentId.toString(),
    client: account.address,
    reputationRegistry,
    reportHash: prepared.reportHash,
    metadataUri: prepared.metadataUri,
    ipfsPinned: prepared.ipfs?.pinned ?? null,
    simulation: { ok: true, gas: gas.toString(), gasPriceWei: gasPrice.toString(), estimatedCostMnt: formatEther(estimatedCostWei) },
    txHash: hash,
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    feedbackIndex,
    gas: { used: receipt.gasUsed.toString(), actualCostMnt: formatEther(actualCostWei) },
    explorer: `https://mantlescan.xyz/tx/${hash}`,
  };
}

/**
 * Append an ERC-8004 Reputation Registry feedback entry for an already-anchored
 * report, WITHOUT touching the proof row's primary `tx_hash` (which stays the
 * ArchonProofRegistry anchor). This is what closes the "full ERC-8004 loop":
 * registry anchor (primary) + reputation feedback (the standard track record).
 *
 * Best-effort and env-gated — returns `{ skipped }` when `ARCHON_REPUTATION_
 * CLIENT_PRIVATE_KEY` is absent, so callers wire it non-blocking (a reputation
 * revert never fails a successful registry anchor). The client wallet must NOT
 * own Agent #97 (the owner self-feedbacks → revert) and must be funded.
 */
export async function appendReputationFeedback(
  reportId: string,
): Promise<
  | { skipped: true; reason: string }
  | { ok: true; txHash: string; feedbackIndex: string | null; client: string; agentId: string; tag2: string; explorer: string }
> {
  const reputationRegistry = process.env.ERC8004_REPUTATION_REGISTRY as Address | undefined;
  const clientKey = process.env.ARCHON_REPUTATION_CLIENT_PRIVATE_KEY as `0x${string}` | undefined;
  const agentRef = process.env.ARCHON_AGENT_IDENTITY_REF;
  if (!clientKey) return { skipped: true, reason: "ARCHON_REPUTATION_CLIENT_PRIVATE_KEY not set" };
  if (!reputationRegistry || !isAddress(reputationRegistry)) return { skipped: true, reason: "ERC8004_REPUTATION_REGISTRY not set" };
  if (!agentRef) return { skipped: true, reason: "ARCHON_AGENT_IDENTITY_REF not set" };
  const agentIdText = agentRef.split(":").at(-1);
  if (!agentIdText || !/^\d+$/.test(agentIdText)) return { skipped: true, reason: `agentId unparseable from ${agentRef}` };
  const agentId = BigInt(agentIdText);

  const rpcUrl = process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";
  const account = privateKeyToAccount(clientKey);
  const chain = { ...mantle, id: 5000 };
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const prepared = await upsertPreparedProof(reportId);
  // Idempotency: never write a second reputation entry for the same report. The
  // already-anchored backfill path calls this for reports that may already have one.
  const existing = await db.query<{ rep: unknown }>(`select erc8004_ref->'reputation' as rep from proofs where id=$1`, [prepared.proofId]).catch(() => null);
  if (existing?.rows[0]?.rep) return { skipped: true, reason: "reputation already recorded for this report" };
  const metadata = prepared.metadata as { report?: { riskScore?: number } };
  const tag2 = `risk:${metadata.report?.riskScore ?? "unknown"}`;
  const args = [agentId, 100n, 0, FEEDBACK_TAG1, tag2, FEEDBACK_ENDPOINT, prepared.metadataUri, prepared.reportHash as `0x${string}`] as const;

  await publicClient.simulateContract({ account: account.address, address: reputationRegistry, abi: reputationRegistryAbi, functionName: "giveFeedback", args });
  const gas = await publicClient.estimateContractGas({ account: account.address, address: reputationRegistry, abi: reputationRegistryAbi, functionName: "giveFeedback", args });
  const gasPrice = await publicClient.getGasPrice();
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < gas * gasPrice) throw new Error(`Reputation client ${account.address} has insufficient MNT: need ${formatEther(gas * gasPrice)}, have ${formatEther(balance)}.`);

  const data = encodeFunctionData({ abi: reputationRegistryAbi, functionName: "giveFeedback", args });
  const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
  const serialized = await walletClient.signTransaction({ account, chain, to: reputationRegistry, data, gas, gasPrice, nonce });
  const hash = await publicClient.sendRawTransaction({ serializedTransaction: serialized });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error("Reputation feedback transaction reverted on-chain.");

  const logs = await publicClient.getLogs({ address: reputationRegistry, event: NEW_FEEDBACK_EVENT, fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber }).catch(() => []);
  const ownLog = logs.find((l) => l.transactionHash.toLowerCase() === hash.toLowerCase() && l.args.clientAddress?.toLowerCase() === account.address.toLowerCase());
  let feedbackIndex = ownLog?.args.feedbackIndex === undefined ? null : String(ownLog.args.feedbackIndex);
  // Same-block getLogs can lag on the public RPC; the contract's getLastIndex view
  // is authoritative for this client's latest feedback index.
  if (feedbackIndex === null) {
    const last = await publicClient.readContract({ address: reputationRegistry, abi: reputationRegistryAbi, functionName: "getLastIndex", args: [agentId, account.address] }).catch(() => null);
    if (last != null) feedbackIndex = String(last);
  }

  // Augment erc8004_ref.reputation; NEVER overwrite the primary registry tx_hash/mechanism.
  await db.query(
    `update proofs set erc8004_ref = coalesce(erc8004_ref, '{}'::jsonb) || jsonb_build_object('reputation', $2::jsonb) where id = $1`,
    [prepared.proofId, JSON.stringify({ reputationRegistry, feedbackClient: account.address, feedbackIndex, txHash: hash, agentId: agentId.toString(), tag2 })],
  );
  return { ok: true, txHash: hash, feedbackIndex, client: account.address, agentId: agentId.toString(), tag2, explorer: `https://mantlescan.xyz/tx/${hash}` };
}
