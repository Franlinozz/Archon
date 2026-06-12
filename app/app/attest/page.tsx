import type { Metadata } from "next";
import { AttestClient } from "./attest-client";

export const metadata: Metadata = { title: "Archon — Verified Builds", description: "Prove that deployed Mantle bytecode matches claimed Solidity source — deterministic, metadata-aware, anchorable." };

export default function AttestPage() {
  return <AttestClient />;
}
