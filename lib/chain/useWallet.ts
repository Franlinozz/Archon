// Wallet connection now flows through RainbowKit + wagmi (see app/providers.tsx,
// components/archon/WalletChip.tsx, lib/chain/useOnMantle.ts). This module retains only the
// pure address formatter still used by the proof modal.
export function shortenAddress(address?: string | null) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}
