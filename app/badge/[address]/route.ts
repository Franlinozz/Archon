import { getAddressProfile } from "@/lib/address/profile";
import { buildBadge } from "@/lib/address/badge";

export const dynamic = "force-dynamic";

// GET /badge/0x….svg?variant=audit|attestation|gas — shields-style SVG.
// Cached at the edge (revalidates as data changes); public data, light to serve.
export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  const { address } = await context.params;
  const addr = address.replace(/\.svg$/i, "");
  const variant = new URL(request.url).searchParams.get("variant") ?? "audit";

  const profile = await getAddressProfile(addr).catch(() => null);
  const svg = profile
    ? buildBadge(profile, variant)
    : `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20"><rect width="120" height="20" rx="3" fill="#555"/><text x="60" y="14" fill="#fff" font-family="Verdana,sans-serif" font-size="11" text-anchor="middle">Archon · n/a</text></svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Short edge cache so a fresh scan reflects within minutes; never per-view DB on cache hit.
      "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
