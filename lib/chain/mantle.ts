import { createPublicClient, http, type Address } from "viem";
import { mantle } from "viem/chains";

export const mantleMainnet = {
  ...mantle,
  id: 5000,
  name: "Mantle Mainnet",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz"] },
    public: { http: [process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz"] },
  },
  blockExplorers: {
    default: { name: "Mantle Explorer", url: "https://explorer.mantle.xyz" },
  },
} as const;

export const MANTLE_CHAIN_ID = 5000;
export const MANTLE_EXPLORER_URL = "https://mantlescan.xyz";

export function getMantlePublicClient() {
  return createPublicClient({ chain: mantleMainnet, transport: http(process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz") });
}

export function explorerTxUrl(txHash: string) {
  return `${MANTLE_EXPLORER_URL}/tx/${txHash}`;
}

export function erc8004Addresses() {
  return {
    identityRegistry: process.env.ERC8004_IDENTITY_REGISTRY as Address | undefined,
    reputationRegistry: process.env.ERC8004_REPUTATION_REGISTRY as Address | undefined,
    validationRegistry: process.env.ERC8004_VALIDATION_REGISTRY as Address | undefined,
    agentIdentityRef: process.env.ARCHON_AGENT_IDENTITY_REF,
  };
}

export function hasVerifiedErc8004Config() {
  const cfg = erc8004Addresses();
  return Boolean(cfg.identityRegistry && cfg.reputationRegistry && cfg.agentIdentityRef);
}

export function validationRegistryStatus() {
  const cfg = erc8004Addresses();
  return cfg.validationRegistry
    ? { available: true, note: "ERC-8004 Validation Registry configured." }
    : {
        available: false,
        note: "ERC-8004 Validation Registry is intentionally out of scope: the official ERC-8004 README does not publish a Mantle Mainnet Validation Registry address.",
      };
}
