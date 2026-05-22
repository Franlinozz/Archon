import { config as loadEnv } from "dotenv";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatEther, http, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";

loadEnv({ path: ".env.local" });
loadEnv();

const envPath = ".env.local";
const rpcUrl = process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";
const ownerKey = process.env.ARCHON_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
let clientKey = process.env.ARCHON_REPUTATION_CLIENT_PRIVATE_KEY as `0x${string}` | undefined;
const fundAmount = parseEther(process.env.ARCHON_REPUTATION_CLIENT_FUND_MNT ?? "0.03");

if (!ownerKey) throw new Error("ARCHON_WALLET_PRIVATE_KEY missing.");
let env = readFileSync(envPath, "utf8");
if (!clientKey) {
  clientKey = generatePrivateKey();
  appendFileSync(envPath, `\nARCHON_REPUTATION_CLIENT_PRIVATE_KEY=${clientKey}\nARCHON_REPUTATION_CLIENT_FUND_MNT=0.03\n`);
  env = readFileSync(envPath, "utf8");
}
const owner = privateKeyToAccount(ownerKey);
const client = privateKeyToAccount(clientKey);
if (!/^ARCHON_REPUTATION_CLIENT_ADDRESS=/m.test(env)) {
  writeFileSync(envPath, `${env.trimEnd()}\nARCHON_REPUTATION_CLIENT_ADDRESS=${client.address}\n`);
}

const chain = { ...mantle, id: 5000 };
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account: owner, chain, transport: http(rpcUrl) });
const [ownerBalance, clientBalance, gasPrice] = await Promise.all([
  publicClient.getBalance({ address: owner.address }),
  publicClient.getBalance({ address: client.address }),
  publicClient.getGasPrice(),
]);

const transferGas = 21_000n;
const transferCost = transferGas * gasPrice;
if (ownerBalance < fundAmount + transferCost) throw new Error(`Owner balance too low. Need ${formatEther(fundAmount + transferCost)} MNT, have ${formatEther(ownerBalance)} MNT.`);

let txHash: `0x${string}` | null = null;
let receipt = null as Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>> | null;
if (clientBalance < fundAmount / 2n) {
  const nonce = await publicClient.getTransactionCount({ address: owner.address, blockTag: "pending" });
  const serialized = await walletClient.signTransaction({ account: owner, chain, to: client.address, value: fundAmount, gas: transferGas, gasPrice, nonce });
  txHash = await publicClient.sendRawTransaction({ serializedTransaction: serialized });
  receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: 120_000 });
}
const finalClientBalance = await publicClient.getBalance({ address: client.address });
console.log(JSON.stringify({
  owner: owner.address,
  client: client.address,
  clientKeyStored: true,
  clientBalanceBeforeMnt: formatEther(clientBalance),
  clientBalanceAfterMnt: formatEther(finalClientBalance),
  fundAmountMnt: txHash ? formatEther(fundAmount) : "0",
  txHash,
  status: receipt?.status ?? "already-funded",
  gasUsed: receipt?.gasUsed?.toString() ?? "0",
  explorer: txHash ? `https://mantlescan.xyz/tx/${txHash}` : null,
}, null, 2));
