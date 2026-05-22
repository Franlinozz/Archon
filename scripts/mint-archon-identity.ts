import { config as loadEnv } from "dotenv";
import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http, isAddress, parseAbiItem, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";
import identityRegistryAbi from "../lib/chain/abis/IdentityRegistry.json";

loadEnv({ path: ".env.local" });
loadEnv();

const rpcUrl = process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";
const identityRegistry = process.env.ERC8004_IDENTITY_REGISTRY as Address | undefined;
const privateKey = process.env.ARCHON_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
const agentUri = process.env.ARCHON_AGENT_URI ?? "https://archonaudit.xyz/.well-known/archon-agent.json";

if (!identityRegistry || !isAddress(identityRegistry)) throw new Error("ERC8004_IDENTITY_REGISTRY must be configured.");
if (!privateKey) throw new Error("ARCHON_WALLET_PRIVATE_KEY must be configured in .env.local.");

const chain = { ...mantle, id: 5000 };
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

const gas = await publicClient.estimateContractGas({
  account: account.address,
  address: identityRegistry,
  abi: identityRegistryAbi,
  functionName: "register",
  args: [agentUri],
});
const gasPrice = await publicClient.getGasPrice();
const estimatedCostWei = gas * gasPrice;
const balance = await publicClient.getBalance({ address: account.address });

if (balance < estimatedCostWei) {
  throw new Error(`Insufficient MNT balance for mint. Required estimate ${formatEther(estimatedCostWei)} MNT, balance ${formatEther(balance)} MNT.`);
}

const sim = await publicClient.simulateContract({
  account: account.address,
  address: identityRegistry,
  abi: identityRegistryAbi,
  functionName: "register",
  args: [agentUri],
});

const data = encodeFunctionData({ abi: identityRegistryAbi, functionName: "register", args: [agentUri] });
const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
const serialized = await walletClient.signTransaction({
  account,
  chain,
  to: identityRegistry,
  data,
  gas,
  gasPrice,
  nonce,
});
const hash = await publicClient.sendRawTransaction({ serializedTransaction: serialized });
const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
const registeredEvent = parseAbiItem("event Registered(uint256 indexed agentId, string agentURI, address indexed owner)");
const logs = await publicClient.getLogs({ address: identityRegistry, event: registeredEvent, fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber });
const ownLog = logs.find((log) => log.transactionHash.toLowerCase() === hash.toLowerCase() && log.args.owner?.toLowerCase() === account.address.toLowerCase());
const eventAgentId = ownLog?.args.agentId;
const agentId = eventAgentId === undefined ? (sim.result === undefined ? null : String(sim.result)) : String(eventAgentId);
const effectiveGasPrice = receipt.effectiveGasPrice ?? gasPrice;
const actualCostWei = receipt.gasUsed * effectiveGasPrice;

console.log(JSON.stringify({
  network: "Mantle Mainnet",
  chainId: 5000,
  identityRegistry,
  owner: account.address,
  agentUri,
  txHash: hash,
  status: receipt.status,
  blockNumber: receipt.blockNumber.toString(),
  agentId,
  agentIdentityRef: agentId ? `eip155:5000:${identityRegistry}:${agentId}` : null,
  gas: {
    estimated: gas.toString(),
    used: receipt.gasUsed.toString(),
    gasPriceWei: effectiveGasPrice.toString(),
    actualCostMnt: formatEther(actualCostWei),
  },
  explorer: `https://mantlescan.xyz/tx/${hash}`,
}, null, 2));
