import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { NO_FLASH_SCRIPT } from "@/components/theme/theme";

const display = localFont({
  src: "./fonts/SpaceGrotesk-Bold.woff2",
  variable: "--font-display",
  fallback: ["Inter", "sans-serif"],
});
const ui = localFont({
  src: [
    { path: "./fonts/Inter-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Inter-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-ui",
  fallback: ["system-ui", "sans-serif"],
});
const mono = localFont({
  src: [
    { path: "./fonts/JetBrainsMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/JetBrainsMono-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-mono",
  fallback: ["monospace"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://archonaudit.xyz"),
  title: "Archon",
  description: "Mantle-native ERC-8004 trustless smart-contract auditor agent.",
  icons: {
    // The tab bar can be light or dark — serve the mark variant that has contrast
    // against each. (Marble mark on light tabs, Obsidian mark on dark tabs.)
    icon: [
      { url: "/favicon-light-32.png", media: "(prefers-color-scheme: light)", type: "image/png", sizes: "32x32" },
      { url: "/favicon-dark-32.png", media: "(prefers-color-scheme: dark)", type: "image/png", sizes: "32x32" },
      { url: "/icon-64.png", type: "image/png", sizes: "64x64" },
    ],
    apple: "/apple-touch.png",
  },
  openGraph: {
    title: "Archon — ERC-8004 trustless auditor on Mantle",
    description: "Read-only smart-contract audits with verifiable on-chain proofs on Mantle Mainnet.",
    url: "https://archonaudit.xyz",
    siteName: "Archon",
    images: [{ url: "/hero-dark.png", width: 2172, height: 724, alt: "Archon" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint: sets the theme class from localStorage (or
            prefers-color-scheme, then Marble) so there is no flash of the wrong
            theme on reload. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className={`${display.variable} ${ui.variable} ${mono.variable}`}><Providers>{children}</Providers></body>
    </html>
  );
}
