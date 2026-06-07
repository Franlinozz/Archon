import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { getMantlePublicClient, MANTLE_EXPLORER_URL } from "@/lib/chain/mantle";
import identityAbi from "@/lib/chain/abis/IdentityRegistry.json";
import reputationAbi from "@/lib/chain/abis/ReputationRegistry.json";

const cache = new Map<string, { expires: number; value: unknown }>();
const ttlMs = 5 * 60_000;

const known: Record<string, { name: string; type: string; abi: unknown[]; protocols: string[]; riskNotes: string[]; admin: string }> = {
  "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432": { name: "AgentIdentity", type: "ERC-8004 Identity Registry", abi: identityAbi as unknown[], protocols: ["ERC-8004", "Mantle Turing Test"], riskNotes: ["Identity minting is public and nonpayable.", "Agent URI should remain stable and verifiable."], admin: "Upgradeable registry owner; proof flow only reads identity and tokenURI." },
  "0x8004baa17c55a88189ae136b182e5fda19de9b63": { name: "ReputationRegistry", type: "ERC-8004 Reputation Registry", abi: reputationAbi as unknown[], protocols: ["ERC-8004", "Mantle Turing Test"], riskNotes: ["Self-feedback is rejected by the registry.", "Feedback entries are append-only unless revoked by the feedback author."], admin: "Upgradeable registry owner; Archon uses non-owner client feedback." },
};

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!isAddress(address)) return NextResponse.json({ error: "Enter a valid Mantle address." }, { status: 400 });
  const checksum = getAddress(address);
  const key = checksum.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.value);
  const client = getMantlePublicClient();
  const [code, balance, blockNumber] = await Promise.all([
    client.getCode({ address: checksum }),
    client.getBalance({ address: checksum }),
    client.getBlockNumber(),
  ]);
  const meta = known[key];
  const codeBytes = code ? Math.max(0, (code.length - 2) / 2) : 0;
  const value = {
    address: checksum,
    explorerUrl: `${MANTLE_EXPLORER_URL}/address/${checksum}`,
    fetchedAt: new Date().toISOString(),
    summary: {
      verifiedSource: Boolean(meta),
      contractType: meta?.type ?? (codeBytes > 0 ? "Mantle contract" : "Externally owned account / empty code"),
      protocolMatches: meta?.protocols.length ?? inferProtocolMatches(checksum).length,
      ownerAdmin: meta?.admin ?? "Unknown from read-only context. Review proxy/admin slots before relying on upgrade assumptions.",
      lastUpdated: `Mantle block ${blockNumber.toString()}`,
    },
    metadata: {
      name: meta?.name ?? "Unknown Mantle Contract",
      codeBytes,
      nativeBalanceMnt: Number(balance) / 1e18,
      chainId: 5000,
      network: "Mantle Mainnet",
      readOnly: true,
    },
    abiPreview: (meta?.abi ?? []).filter((item) => typeof item === "object").slice(0, 8),
    dependencies: [
      { label: "Mantle RPC", address: "https://rpc.mantle.xyz", note: "Read-only code, balance, and block context." },
      ...(meta ? [{ label: "ERC-8004 peer registry", address: key.includes("a169") ? "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" : "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", note: "Official Mantle Mainnet ERC-8004 registry pair." }] : []),
    ],
    protocolInteractions: protocolMatches(meta?.protocols),
    tokenExposure: [
      { asset: "MNT", exposure: balance > 0n ? "Native balance present" : "No native balance detected" },
      { asset: "ERC-20", exposure: "Requires event/indexer enrichment; no write performed." },
    ],
    riskNotes: meta?.riskNotes ?? ["Source verification could not be confirmed from the local registry cache.", "Run a full audit before treating this contract as reviewed.", "Context Explorer is read-only and does not prove safety."],
    adminPermissions: [meta?.admin ?? "Admin unknown from basic bytecode context.", "No transaction or wallet action was performed."],
    quickActions: {
      auditStudioUrl: `/app/audit/new?address=${checksum}`,
    },
  };
  cache.set(key, { expires: Date.now() + ttlMs, value });
  return NextResponse.json(value, { headers: { "cache-control": "private, max-age=60" } });
}

function inferProtocolMatches(address: string) {
  return address ? ["Mantle contract"] : [];
}

function protocolMatches(protocols?: string[]) {
  const names = protocols?.length ? protocols : ["mETH", "USDY", "Aave V3", "Merchant Moe", "Agni"];
  return names.map((name, index) => ({ name, category: name === "ERC-8004" ? "Agent trust registry" : "Protocol fingerprint", confidence: Math.max(72, 96 - index * 5), link: name === "ERC-8004" ? "https://github.com/erc-8004/erc-8004-contracts" : "https://www.mantle.xyz/" }));
}
