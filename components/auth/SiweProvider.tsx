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
  signIn: () => Promise<boolean>;
};

const SiweContext = createContext<SiweContextValue | null>(null);

export function SiweProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected, chainId, status: walletStatus } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<SiweStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false); // session cookie checked yet?
  const attemptedFor = useRef<string | null>(null); // address we've auto-attempted

  const onMantle = isConnected && chainId === MANTLE_CHAIN_ID;
  const signedIn = !!sessionAddress && !!address && sessionAddress.toLowerCase() === address.toLowerCase();

  // Hydrate any existing session on mount BEFORE we ever auto-prompt, so a
  // returning user with a valid 7-day cookie is silently re-authed (no signature).
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d: { address: string | null }) => { if (active) setSessionAddress(d.address); })
      .catch(() => {})
      .finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async () => {
    if (!address || !onMantle) return false;
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
      // Confirm the httpOnly cookie is visible before UI/navigation relies on
      // it. This avoids a race where the client marks itself signed-in, pushes
      // into /app, and middleware still sees the previous unauthenticated
      // request until the user refreshes.
      const session = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
        .then((r) => r.json())
        .catch(() => ({ address: data.address } as { address: string | null }));
      setSessionAddress(session.address ?? data.address);
      setStatus("signed-in");
      return true;
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Sign-in was cancelled.");
      return false;
    }
  }, [address, onMantle, signMessageAsync]);

  // Auto sign-in once per connected address (free signature) — only once the
  // wallet is FULLY connected (status "connected", not the transient
  // "reconnecting" on refresh) AND the existing-session check has resolved. We
  // wait a settle delay before prompting; if a valid session hydrates (or the
  // wallet state changes) during that window the effect re-runs and cancels the
  // timer, so a returning user is never re-prompted on refresh.
  useEffect(() => {
    if (!hydrated || walletStatus !== "connected" || !onMantle || !address) return;
    if (signedIn) { attemptedFor.current = address.toLowerCase(); return; }
    if (attemptedFor.current === address.toLowerCase()) return;
    const timer = setTimeout(() => {
      attemptedFor.current = address.toLowerCase();
      void signIn();
    }, 1500);
    return () => clearTimeout(timer);
  }, [hydrated, walletStatus, onMantle, address, signedIn, signIn]);

  // Clear the session only on a DEFINITIVE disconnect — never during the
  // "reconnecting" window after a refresh (that race was logging valid sessions
  // out and forcing a re-prompt).
  useEffect(() => {
    if (walletStatus !== "disconnected") return;
    attemptedFor.current = null;
    if (sessionAddress) {
      fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      setSessionAddress(null);
      setStatus("idle");
    }
  }, [walletStatus, sessionAddress]);

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
