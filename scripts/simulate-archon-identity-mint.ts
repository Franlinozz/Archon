import { config as loadEnv } from "dotenv";
import { createPublicClient, encodeFunctionData, formatEther, http, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";
import identityRegistryAbi from "../lib/chain/abis/IdentityRegistry.json";

loadEnv({ path: ".env.local" });
loadEnv();

const rpcUrl = process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";
const identityRegistry = process.env.ERC8004_IDENTITY_REGISTRY;
const privateKey = process.env.ARCHON_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
const simulationAccount = privateKey ? privateKeyToAccount(privateKey).address : (process.env.ARCHON_SIMULATION_ACCOUNT ?? "0x000000000000000000000000000000000000dEaD") as Address;
const agentUri = process.env.ARCHON_AGENT_URI ?? "https://archonaudit.xyz/.well-known/archon-agent.json";

if (!identityRegistry || !isAddress(identityRegistry)) {
  throw new Error("ERC8004_IDENTITY_REGISTRY must be configured before simulation.");
}
if (!isAddress(simulationAccount)) {
  throw new Error("ARCHON_SIMULATION_ACCOUNT must be a valid address when provided.");
}

const client = createPublicClient({ chain: { ...mantle, id: 5000 }, transport: http(rpcUrl) });

const registerItems = identityRegistryAbi.filter((item) => item.type === "function" && item.name === "register");
const registerWithUri = registerItems.find((item) => item.inputs?.length === 1 && item.inputs[0]?.type === "string");
if (!registerWithUri) throw new Error("Official IdentityRegistry ABI does not include register(string).");

const registerSignatures = registerItems.map((item) => {
  const inputs = item.inputs?.map((input) => input.type).join(",") ?? "";
  return `register(${inputs}) ${item.stateMutability}`;
});

const result = await client.simulateContract({
  account: simulationAccount,
  address: identityRegistry as Address,
  abi: identityRegistryAbi,
  functionName: "register",
  args: [agentUri],
});

const gas = await client.estimateContractGas({
  account: simulationAccount,
  address: identityRegistry as Address,
  abi: identityRegistryAbi,
  functionName: "register",
  args: [agentUri],
});
const gasPrice = await client.getGasPrice();
const nativeCostWei = gas * gasPrice;
const code = await client.getBytecode({ address: identityRegistry as Address });
const version = await client.readContract({ address: identityRegistry as Address, abi: identityRegistryAbi, functionName: "getVersion" });
const name = await client.readContract({ address: identityRegistry as Address, abi: identityRegistryAbi, functionName: "name" });
const symbol = await client.readContract({ address: identityRegistry as Address, abi: identityRegistryAbi, functionName: "symbol" });
const supportsErc721 = await client.readContract({ address: identityRegistry as Address, abi: identityRegistryAbi, functionName: "supportsInterface", args: ["0x80ac58cd"] });

console.log(JSON.stringify({
  network: "Mantle Mainnet",
  chainId: 5000,
  rpcUrl,
  identityRegistry,
  contract: { bytecodeBytes: code ? (code.length - 2) / 2 : 0, version, name, symbol, supportsErc721 },
  registerFunctions: registerSignatures,
  selectedMintCall: "register(string agentURI)",
  stateMutability: registerWithUri.stateMutability,
  payable: registerWithUri.stateMutability === "payable",
  permissioning: "public external; no onlyOwner/allowlist gate in official source for register overloads",
  agentUri,
  simulationAccount,
  usingRealWallet: Boolean(privateKey),
  simulation: {
    ok: true,
    returnedAgentId: result.result === undefined ? null : String(result.result),
    calldata: encodeFunctionData({ abi: identityRegistryAbi, functionName: "register", args: [agentUri] }),
  },
  gas: {
    estimate: gas.toString(),
    gasPriceWei: gasPrice.toString(),
    estimatedCostMnt: formatEther(nativeCostWei),
  },
}, null, 2));
