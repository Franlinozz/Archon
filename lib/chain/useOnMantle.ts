"use client";

import { useAccount } from "wagmi";
import { MANTLE_CHAIN_ID } from "./mantle";

// True only when a wallet is connected AND on Mantle Mainnet (5000). Use to gate any
// user-initiated on-chain write so it cannot fire on the wrong network.
export function useOnMantle() {
  const { isConnected, chainId } = useAccount();
  return isConnected && chainId === MANTLE_CHAIN_ID;
}
