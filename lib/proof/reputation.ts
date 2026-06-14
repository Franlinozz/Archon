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
