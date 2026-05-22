"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MANTLE_CHAIN_ID } from "./mantle";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global { interface Window { ethereum?: EthereumProvider } }

export function shortenAddress(address?: string | null) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const isMantle = chainId === MANTLE_CHAIN_ID;

  const refresh = useCallback(async () => {
    if (!window.ethereum) return;
    const [accounts, rawChainId] = await Promise.all([
      window.ethereum.request({ method: "eth_accounts" }) as Promise<string[]>,
      window.ethereum.request({ method: "eth_chainId" }) as Promise<string>,
    ]);
    setAddress(accounts[0] ?? null);
    setChainId(Number.parseInt(rawChainId, 16));
  }, []);

  useEffect(() => {
    void refresh();
    const accountsChanged = (accounts: unknown) => setAddress(Array.isArray(accounts) ? String(accounts[0] ?? "") || null : null);
    const chainChanged = (raw: unknown) => setChainId(typeof raw === "string" ? Number.parseInt(raw, 16) : null);
    window.ethereum?.on?.("accountsChanged", accountsChanged);
    window.ethereum?.on?.("chainChanged", chainChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", accountsChanged);
      window.ethereum?.removeListener?.("chainChanged", chainChanged);
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    setError(null);
    if (!window.ethereum) { setError("No injected wallet found. Install MetaMask or Rabby to continue."); return; }
    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      setAddress(accounts[0] ?? null);
      const rawChainId = await window.ethereum.request({ method: "eth_chainId" }) as string;
      setChainId(Number.parseInt(rawChainId, 16));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet connection was rejected.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => setAddress(null), []);

  const switchToMantle = useCallback(async () => {
    setError(null);
    if (!window.ethereum) { setError("No injected wallet found."); return; }
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x1388" }],
      });
      await refresh();
    } catch (err) {
      const maybeCode = typeof err === "object" && err && "code" in err ? Number((err as { code: unknown }).code) : 0;
      if (maybeCode === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x1388",
            chainName: "Mantle Mainnet",
            nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
            rpcUrls: [process.env.NEXT_PUBLIC_MANTLE_RPC_URL ?? "https://rpc.mantle.xyz"],
            blockExplorerUrls: ["https://explorer.mantle.xyz"],
          }],
        });
        await refresh();
      } else {
        setError(err instanceof Error ? err.message : "Could not switch to Mantle Mainnet.");
      }
    }
  }, [refresh]);

  return useMemo(() => ({ address, chainId, isMantle, error, connecting, connect, disconnect, switchToMantle, refresh }), [address, chainId, isMantle, error, connecting, connect, disconnect, switchToMantle, refresh]);
}
