"use client";

import { useState } from "react";
import { Wallet, X } from "lucide-react";
import { shortenAddress, useWallet } from "@/lib/chain/useWallet";

export function WalletChip() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const label = wallet.address ? shortenAddress(wallet.address) : "Connect wallet";
  return <>
    <button onClick={() => setOpen(true)} className={wallet.address && wallet.isMantle ? "flex items-center gap-2 rounded-pill border border-success/30 bg-success/10 px-3 py-2 text-xs text-success" : "flex items-center gap-2 rounded-pill border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"}>
      <Wallet size={14}/>{label}{wallet.address && !wallet.isMantle ? " · Switch to Mantle" : ""}
    </button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-card border border-border-subtle bg-surface-1 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.14em] text-green-400">Wallet Connect</p><h2 className="mt-2 text-2xl font-semibold text-text-hi">Mantle Mainnet wallet</h2><p className="mt-2 text-sm text-text-mid">Archon only enables proof signing when your wallet is connected to Mantle Mainnet (chain ID 5000).</p></div><button onClick={() => setOpen(false)} className="rounded-control border border-border-subtle bg-surface-2 p-2 text-text-mid"><X size={16}/></button></div>
        <div className="mt-5 space-y-3 rounded-card border border-border-subtle bg-terminal p-4 text-sm">
          <Row label="Address" value={wallet.address ?? "Not connected"}/>
          <Row label="Network" value={wallet.chainId ? wallet.chainId === 5000 ? "Mantle Mainnet · 5000" : `Wrong network · ${wallet.chainId}` : "Unknown"}/>
          {wallet.error ? <p className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-danger">{wallet.error}</p> : null}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {wallet.address ? <button onClick={wallet.disconnect} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-mid">Disconnect</button> : null}
          {!wallet.address ? <button disabled={wallet.connecting} onClick={wallet.connect} className="rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-canvas disabled:opacity-60">{wallet.connecting ? "Connecting…" : "Connect wallet"}</button> : null}
          {wallet.address && !wallet.isMantle ? <button onClick={wallet.switchToMantle} className="rounded-control bg-warning px-3 py-2 text-sm font-semibold text-canvas">Switch to Mantle Mainnet</button> : null}
          {wallet.address && wallet.isMantle ? <button onClick={() => setOpen(false)} className="rounded-control bg-green-400 px-3 py-2 text-sm font-semibold text-canvas">Ready</button> : null}
        </div>
      </div>
    </div> : null}
  </>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-text-low">{label}</span><span className="font-mono text-text-hi">{value}</span></div>;
}
