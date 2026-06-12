import { NextResponse } from "next/server";
import { providerStatus } from "@/lib/ai/provider";
import { cosStatus } from "@/lib/storage/cos";

export const dynamic = "force-dynamic";

// Public, secret-free cloud-provider status: which AI/storage adapters are
// configured vs inert. Backs the docs "Cloud providers" page so the claim of
// what is live is always checkable, never asserted.
export async function GET() {
  const ai = providerStatus();
  return NextResponse.json({
    schema: "archon.providers.v1",
    generatedAt: new Date().toISOString(),
    ai,
    storage: {
      primary: { id: "ipfs", label: "IPFS pinning", configured: Boolean(process.env.IPFS_PIN_TOKEN), provider: process.env.IPFS_PIN_PROVIDER ?? "web3storage" },
      backup: cosStatus(),
    },
  });
}
