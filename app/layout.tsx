import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

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
  title: "Archon",
  description: "Mantle-native ERC-8004 trustless smart-contract auditor agent.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${display.variable} ${ui.variable} ${mono.variable}`}><Providers>{children}</Providers></body>
    </html>
  );
}
