import { config as loadEnv } from "dotenv";
import { createPublicClient, formatEther, http, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";
import reputationRegistryAbi from "../lib/chain/abis/ReputationRegistry.json";
import { prepareProof } from "../lib/proof/report";

loadEnv({ path: ".env.local" });
loadEnv();

const reportId = process.argv[2];
if (!reportId) throw new Error("Usage: pnpm tsx scripts/simulate-report-reputation-proof.ts <reportId>");

const rpcUrl = process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";
const reputationRegistry = process.env.ERC8004_REPUTATION_REGISTRY as Address | undefined;
const privateKey = process.env.ARCHON_REPUTATION_CLIENT_PRIVATE_KEY as `0x${string}` | undefined;
const agentRef = process.env.ARCHON_AGENT_IDENTITY_REF;
if (!reputationRegistry || !isAddress(reputationRegistry)) throw new Error("ERC8004_REPUTATION_REGISTRY must be configured.");
if (!privateKey) throw new Error("ARCHON_REPUTATION_CLIENT_PRIVATE_KEY must be configured.");
if (!agentRef) throw new Error("ARCHON_AGENT_IDENTITY_REF must be configured.");
const agentIdText = agentRef.split(":").at(-1);
if (!agentIdText || !/^\d+$/.test(agentIdText)) throw new Error(`Could not parse agentId from ARCHON_AGENT_IDENTITY_REF=${agentRef}`);
const agentId = BigInt(agentIdText);
const account = privateKeyToAccount(privateKey);
const client = createPublicClient({ chain: { ...mantle, id: 5000 }, transport: http(rpcUrl) });

const prepared = await prepareProof(reportId);
const metadata = prepared.metadata as { report?: { riskScore?: number } };
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

let simulation: Record<string, unknown>;
try {
  await client.simulateContract({
    account: account.address,
    address: reputationRegistry,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args,
  });
  const gas = await client.estimateContractGas({
    account: account.address,
    address: reputationRegistry,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args,
  });
  const gasPrice = await client.getGasPrice();
  simulation = { ok: true, gas: gas.toString(), gasPriceWei: gasPrice.toString(), estimatedCostMnt: formatEther(gas * gasPrice) };
} catch (error) {
  const err = error as { shortMessage?: string; details?: string; message?: string };
  simulation = { ok: false, shortMessage: err.shortMessage, details: err.details, message: err.message?.split("\n").slice(0, 6).join("\n") };
}

console.log(JSON.stringify({
  reportId,
  agentId: agentId.toString(),
  caller: account.address,
  reputationRegistry,
  reportHash: prepared.reportHash,
  metadataUri: prepared.metadataUri.slice(0, 120) + (prepared.metadataUri.length > 120 ? "…" : ""),
  pinned: prepared.ipfs.pinned,
  simulation,
}, null, 2));
