import type { Metadata } from "next";
import { SentinelClient } from "./sentinel-client";

export const metadata: Metadata = { title: "Archon — Sentinel", description: "Continuous audit for deployed Mantle contracts: drift detection, automatic re-scans, and audit freshness." };

export default function SentinelPage() {
  return <SentinelClient />;
}
