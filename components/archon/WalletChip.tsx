"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, Wallet } from "lucide-react";

// RainbowKit-driven wallet control, Mantle Mainnet only. The wagmi config registers chain
// 5000 as the sole supported chain, so any other network surfaces as `chain.unsupported`
// and we render a "Switch to Mantle" guard. Writes elsewhere gate on useOnMantle().
export function WalletChip() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        return (
          <div aria-hidden={!ready} className={!ready ? "pointer-events-none opacity-0" : ""}>
            {(() => {
              if (!connected) {
                return (
                  <button onClick={openConnectModal} className="inline-flex items-center gap-2 rounded-pill border border-green-400/40 bg-green-400/10 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-400/15">
                    <Wallet size={14} /> Connect wallet
                  </button>
                );
              }
              if (chain.unsupported) {
                return (
                  <button onClick={openChainModal} className="inline-flex items-center gap-2 rounded-pill border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/15">
                    <AlertTriangle size={14} /> Switch to Mantle
                  </button>
                );
              }
              return (
                <button onClick={openAccountModal} className="inline-flex items-center gap-2 rounded-pill border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/15">
                  <span className="size-1.5 rounded-full bg-success" />
                  <span className="font-mono">{account.displayName}</span>
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

// Write-gate helper: true only when a wallet is connected AND on Mantle Mainnet (5000).
export { useOnMantle } from "@/lib/chain/useOnMantle";
