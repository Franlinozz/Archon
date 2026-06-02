import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, hexToString, http, isAddress, parseAbiItem, stringToHex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";
import identityRegistryAbi from "@/lib/chain/abis/IdentityRegistry.json";
import { db } from "@/lib/db/client";
import { upsertPreparedProof } from "./report";

// Option A (Session 14): a report proof is SELF-ATTESTATION — Archon's agent
// records the report hash + IPFS URI against its OWN identity via the ERC-8004
// Identity Registry's setMetadata(agentId, key, value). The agent owner writing
// its own identity metadata is permitted (unlike Reputation giveFeedback, which
// forbids self-feedback). Canonical report hash is unchanged.

type Prepared = Awaited<ReturnType<typeof upsertPreparedProof>>;
const chain = { ...mantle, id: 5000 } as const;
const rpc = () => process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";

const METADATA_SET_EVENT = parseAbiItem(
  "event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)",
);

function identityConfig() {
  const identityRegistry = process.env.ERC8004_IDENTITY_REGISTRY as Address | undefined;
  const agentRef = process.env.ARCHON_AGENT_IDENTITY_REF;
  if (!identityRegistry || !isAddress(identityRegistry)) throw new Error("ERC8004_IDENTITY_REGISTRY must be configured.");
  if (!agentRef) throw new Error("ARCHON_AGENT_IDENTITY_REF must be configured.");
  const agentIdText = agentRef.split(":").at(-1);
  if (!agentIdText || !/^\d+$/.test(agentIdText)) throw new Error(`Could not parse agentId from ${agentRef}`);
  return { identityRegistry, agentId: BigInt(agentIdText) };
}

const metadataKeyFor = (reportId: string) => `archon.report.${reportId}`;

// The on-chain payload: report hash + IPFS metadata URI, encoded as bytes.
function attestPayload(prepared: Prepared) {
  return stringToHex(JSON.stringify({ v: 1, reportHash: prepared.reportHash, metadataUri: prepared.metadataUri }));
}

/** Public params surfaced to the client so a self-custody wallet builds the exact
 *  same setMetadata call. */
export function identityAttestParams(reportId: string, prepared: Prepared) {
  const { identityRegistry, agentId } = identityConfig();
  const metadataKey = metadataKeyFor(reportId);
  return { mechanism: "identity-setMetadata" as const, identityRegistry, agentId: agentId.toString(), metadataKey, metadataValue: attestPayload(prepared) };
}

function publicClient() {
  return createPublicClient({ chain, transport: http(rpc()) });
}

// Returns the already-anchored proof for this report, if one exists on-chain
// with the SAME report hash (read-before-write duplicate guard).
async function findExistingAnchor(reportId: string, prepared: Prepared) {
  const { identityRegistry, agentId } = identityConfig();
  const pc = publicClient();
  const value = (await pc.readContract({ address: identityRegistry, abi: identityRegistryAbi, functionName: "getMetadata", args: [agentId, metadataKeyFor(reportId)] }).catch(() => "0x")) as `0x${string}`;
  if (!value || value === "0x") return null;
  try {
    const prev = JSON.parse(hexToString(value)) as { reportHash?: string };
    if (prev.reportHash?.toLowerCase() !== (prepared.reportHash as string).toLowerCase()) return null;
  } catch {
    return null;
  }
  const row = await db.query<{ txHash: string | null }>(`select tx_hash as "txHash" from proofs where report_id=$1`, [reportId]).catch(() => null);
  const txHash = row?.rows[0]?.txHash ?? null;
  return { txHash };
}

// GASLESS: Archon's server (the agent OWNER wallet) self-attests. Simulates first
// so a would-be revert is surfaced (not silently submitted), and bounds the
// receipt wait so it can never hang forever.
export async function logPreparedProofOnIdentity(reportId: string) {
  const ownerKey = process.env.ARCHON_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!ownerKey) throw new Error("ARCHON_WALLET_PRIVATE_KEY must be configured.");
  const prepared = await upsertPreparedProof(reportId);
  const { identityRegistry, agentId } = identityConfig();
  const metadataKey = metadataKeyFor(reportId);
  const metadataValue = attestPayload(prepared);

  const dup = await findExistingAnchor(reportId, prepared);
  if (dup) return { reportId, proofId: prepared.proofId, alreadyAnchored: true, txHash: dup.txHash, reportHash: prepared.reportHash, metadataUri: prepared.metadataUri, explorer: dup.txHash ? `https://mantlescan.xyz/tx/${dup.txHash}` : null };

  const account = privateKeyToAccount(ownerKey);
  const pc = publicClient();
  const wc = createWalletClient({ account, chain, transport: http(rpc()) });
  const args = [agentId, metadataKey, metadataValue] as const;

  // Pre-flight: reverts (incl. "not owner") surface here, before any send.
  await pc.simulateContract({ account: account.address, address: identityRegistry, abi: identityRegistryAbi, functionName: "setMetadata", args });
  const gas = await pc.estimateContractGas({ account: account.address, address: identityRegistry, abi: identityRegistryAbi, functionName: "setMetadata", args });
  const gasPrice = await pc.getGasPrice();
  const balance = await pc.getBalance({ address: account.address });
  if (balance < gas * gasPrice) throw new Error(`Archon's signer wallet has insufficient MNT. Need ${formatEther(gas * gasPrice)}, balance ${formatEther(balance)}.`);

  const data = encodeFunctionData({ abi: identityRegistryAbi, functionName: "setMetadata", args });
  const nonce = await pc.getTransactionCount({ address: account.address, blockTag: "pending" });
  const serialized = await wc.signTransaction({ account, chain, to: identityRegistry, data, gas, gasPrice, nonce });
  const hash = await pc.sendRawTransaction({ serializedTransaction: serialized });
  const receipt = await pc.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
  if (receipt.status !== "success") throw new Error("Identity attestation reverted on-chain.");

  await recordProof(prepared.proofId, hash, prepared.metadataUri, { agentId, identityRegistry, metadataKey, author: account.address });
  return {
    reportId, proofId: prepared.proofId, txHash: hash, reportHash: prepared.reportHash, metadataUri: prepared.metadataUri,
    agentId: agentId.toString(), author: account.address, loggedBy: account.address, status: receipt.status,
    gas: { used: receipt.gasUsed.toString(), actualCostMnt: formatEther(receipt.gasUsed * (receipt.effectiveGasPrice ?? gasPrice)) },
    explorer: `https://mantlescan.xyz/tx/${hash}`,
  };
}

// SELF-CUSTODY: the user already submitted setMetadata from their wallet (must be
// the agent owner). Verify the MetadataSet event + matching hash, then record.
export async function verifyAndRecordIdentityUserProof(reportId: string, txHash: `0x${string}`, expectedAuthor?: string) {
  const prepared = await upsertPreparedProof(reportId);
  const { identityRegistry, agentId } = identityConfig();
  const pc = publicClient();
  const receipt = await pc.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: 90_000 });
  if (receipt.status !== "success") throw new Error("Transaction reverted on-chain.");

  const logs = await pc.getLogs({ address: identityRegistry, event: METADATA_SET_EVENT, fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber });
  const own = logs.find((l) => l.transactionHash.toLowerCase() === txHash.toLowerCase() && l.args.agentId === agentId);
  if (!own) throw new Error("No identity MetadataSet event for this agent was found in the transaction.");
  let matches = false;
  try { matches = (JSON.parse(hexToString(own.args.metadataValue as `0x${string}`)) as { reportHash?: string }).reportHash?.toLowerCase() === (prepared.reportHash as string).toLowerCase(); } catch { matches = false; }
  if (!matches) throw new Error("On-chain metadata does not match this report's hash.");

  const author = (receipt.from ?? "").toLowerCase();
  if (expectedAuthor && author !== expectedAuthor.toLowerCase()) throw new Error("The transaction was submitted by a different wallet than the signed-in session.");
  await recordProof(prepared.proofId, txHash, prepared.metadataUri, { agentId, identityRegistry, metadataKey: own.args.metadataKey as string, author });
  return { reportId, proofId: prepared.proofId, txHash, reportHash: prepared.reportHash, agentId: agentId.toString(), author, loggedBy: author, verified: true, explorer: `https://mantlescan.xyz/tx/${txHash}` };
}

async function recordProof(proofId: string, txHash: string, metadataUri: string, ref: { agentId: bigint; identityRegistry: string; metadataKey: string; author: string }) {
  await db.query(
    `update proofs set tx_hash=$2, metadata_uri=$3, verification_status='proof_logged', logged_at=now(), erc8004_ref=$4::jsonb where id=$1`,
    [proofId, txHash, metadataUri, JSON.stringify({ mechanism: "identity-setMetadata", identityRegistry: ref.identityRegistry, agentId: ref.agentId.toString(), metadataKey: ref.metadataKey, author: ref.author, loggedBy: ref.author })],
  );
}
