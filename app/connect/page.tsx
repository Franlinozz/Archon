"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { AlertTriangle, ArrowLeft, Wallet } from "lucide-react";
import { useSiwe } from "@/components/auth/SiweProvider";
import { MANTLE_CHAIN_ID } from "@/lib/chain/mantle";

// Only allow internal same-origin redirect targets.
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/app";
}

export default function ConnectPage() {
  const router = useRouter();
  const { isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending } = useSwitchChain();
  const { signedIn, signIn, status, error } = useSiwe();
  const [next, setNext] = useState("/app");
  const onMantle = isConnected && chainId === MANTLE_CHAIN_ID;

  useEffect(() => {
    setNext(safeNext(new URLSearchParams(window.location.search).get("next")));
  }, []);

  // Once signed in (cookie set), land the user where they intended.
  useEffect(() => {
    if (signedIn) router.replace(next);
  }, [signedIn, next, router]);

  return (
    <main className="grid min-h-screen place-items-center px-6 text-text-hi">
      <div className="archon-arch w-full max-w-md rounded-card border border-border-subtle bg-surface-1 p-8 shadow-lift">
        <div className="flex flex-col items-center text-center">
          <span className="relative block size-12 overflow-hidden rounded-[10px]">
            <Image src="/mark-light.png" alt="Archon" width={48} height={48} className="only-marble size-12 object-cover" priority />
            <Image src="/mark-dark.png" alt="" aria-hidden width={48} height={48} className="only-obsidian size-12 object-cover" priority />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Sign in to Archon</h1>
          <p className="mt-2 text-sm leading-relaxed text-body">
            Archon requires a free wallet signature to sign in — <span className="font-semibold text-ink">no gas, no transaction</span>. It proves wallet ownership and unlocks your workspace.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {!isConnected ? (
            <button onClick={() => openConnectModal?.()} className="archon-sheen flex w-full items-center justify-center gap-2 rounded-control bg-green-400 px-4 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-300">
              <Wallet size={16} /> Connect wallet
            </button>
          ) : !onMantle ? (
            <button onClick={() => switchChain({ chainId: MANTLE_CHAIN_ID })} disabled={isPending} className="flex w-full items-center justify-center gap-2 rounded-control bg-warning px-4 py-2.5 text-sm font-semibold text-canvas disabled:opacity-50">
              <AlertTriangle size={16} /> Switch to Mantle Mainnet
            </button>
          ) : (
            <button onClick={() => void signIn()} disabled={status === "signing"} className="flex w-full items-center justify-center gap-2 rounded-control bg-green-400 px-4 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-300 disabled:opacity-60">
              <Wallet size={16} /> {status === "signing" ? "Check your wallet to sign…" : "Sign in — free signature"}
            </button>
          )}

          {status === "signing" ? <p className="text-center text-xs text-text-low">A signature request opened in your wallet. This is free and sends no transaction.</p> : null}
          {error && status === "error" ? <p className="text-center text-xs text-danger">{error} — <button onClick={() => void signIn()} className="underline">try again</button></p> : null}
        </div>

        <div className="mt-6 border-t border-border-subtle pt-4 text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-text-low transition-colors hover:text-ink"><ArrowLeft size={13} /> Back to home — browse docs &amp; public proofs without a wallet</Link>
        </div>
      </div>
    </main>
  );
}
