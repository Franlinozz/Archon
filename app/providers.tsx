"use client";

import { useMemo, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/lib/chain/wagmi";
import { ThemeProvider, useTheme } from "@/components/theme/ThemeProvider";
import { SiweProvider } from "@/components/auth/SiweProvider";

// Obsidian-matched RainbowKit theme: bright green accent on dark surfaces.
const obsidianWalletTheme = darkTheme({
  accentColor: "#3FD98A",
  accentColorForeground: "#06140E",
  borderRadius: "medium",
  overlayBlur: "small",
});

// Marble-matched RainbowKit theme: confident emerald fill, white foreground.
const marbleWalletTheme = lightTheme({
  accentColor: "#0E815A",
  accentColorForeground: "#FFFFFF",
  borderRadius: "medium",
  overlayBlur: "small",
});

// Bridges the app theme into RainbowKit so the wallet modal matches the
// active surface instead of being stuck on the dark accent.
function WalletThemeBridge({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const walletTheme = useMemo(
    () => (theme === "obsidian" ? obsidianWalletTheme : marbleWalletTheme),
    [theme],
  );
  return (
    <RainbowKitProvider theme={walletTheme} modalSize="compact">
      <SiweProvider>{children}</SiweProvider>
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <WalletThemeBridge>{children}</WalletThemeBridge>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
