import { http } from "wagmi";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mantleMainnet } from "./mantle";

// Mantle Mainnet (chain 5000) ONLY — any other chain shows as unsupported in RainbowKit,
// which drives the network guard. A WalletConnect projectId enables WC wallets; injected
// wallets (MetaMask/Rabby/browser) work without one.
export const wagmiConfig = getDefaultConfig({
  appName: "Archon",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "archon-mantle-mainnet",
  chains: [mantleMainnet],
  ssr: true,
  transports: {
    [mantleMainnet.id]: http(process.env.NEXT_PUBLIC_MANTLE_RPC_URL ?? "https://rpc.mantle.xyz"),
  },
});
