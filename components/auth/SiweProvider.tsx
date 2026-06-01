"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { buildSiweMessage } from "@/lib/auth/siwe";
import { MANTLE_CHAIN_ID } from "@/lib/chain/mantle";

type SiweStatus = "idle" | "signing" | "signed-in" | "error";
type SiweContextValue = {
  sessionAddress: string | null;
  signedIn: boolean; // session address matches the connected wallet
  status: SiweStatus;
  error: string | null;
  signIn: () => Promise<void>;
};

const SiweContext = createContext<SiweContextValue | null>(null);

export function SiweProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<SiweStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const attemptedFor = useRef<string | null>(null); // address we've auto-attempted

  const onMantle = isConnected && chainId === MANTLE_CHAIN_ID;
  const signedIn = !!sessionAddress && !!address && sessionAddress.toLowerCase() === address.toLowerCase();

  // Hydrate any existing session on mount.
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d: { address: string | null }) => { if (active) setSessionAddress(d.address); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async () => {
    if (!address || !onMantle) return;
    setStatus("signing");
    setError(null);
    try {
      const { nonce } = await fetch("/api/auth/nonce").then((r) => r.json());
      const message = buildSiweMessage({
        domain: window.location.host,
        address,
        uri: window.location.origin,
        chainId: MANTLE_CHAIN_ID,
        nonce,
        issuedAt: new Date().toISOString(),
      });
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sign-in failed.");
      setSessionAddress(data.address);
      setStatus("signed-in");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Sign-in was cancelled.");
    }
  }, [address, onMantle, signMessageAsync]);

  // Auto sign-in once per connected address (free signature). If declined, the
  // user can retry manually via signIn(); we don't loop.
  useEffect(() => {
    if (!isConnected || !onMantle || !address) return;
    if (signedIn) { attemptedFor.current = address.toLowerCase(); return; }
    if (attemptedFor.current === address.toLowerCase()) return;
    attemptedFor.current = address.toLowerCase();
    void signIn();
  }, [isConnected, onMantle, address, signedIn, signIn]);

  // Clear the session when the wallet disconnects.
  useEffect(() => {
    if (isConnected) return;
    attemptedFor.current = null;
    if (sessionAddress) {
      fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      setSessionAddress(null);
      setStatus("idle");
    }
  }, [isConnected, sessionAddress]);

  const value = useMemo<SiweContextValue>(
    () => ({ sessionAddress, signedIn, status, error, signIn }),
    [sessionAddress, signedIn, status, error, signIn],
  );

  return <SiweContext.Provider value={value}>{children}</SiweContext.Provider>;
}

export function useSiwe(): SiweContextValue {
  const ctx = useContext(SiweContext);
  if (!ctx) throw new Error("useSiwe must be used within <SiweProvider>");
  return ctx;
}
