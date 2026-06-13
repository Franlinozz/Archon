import type { MetadataRoute } from "next";
import { knownAddresses } from "@/lib/address/profile";

// Static surfaces + a per-address door for every contract Archon has evidence on
// (the SEO distribution engine). Address rows are best-effort; DB issues never
// break the core sitemap.
const BASE = "https://archonaudit.xyz";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ["", "/observatory", "/observatory/methodology", "/gas-leaderboard", "/proofs", "/pricing", "/docs", "/api-reference"].map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7,
  }));

  let addresses: string[] = [];
  try { addresses = await knownAddresses(2000); } catch { /* core sitemap still serves */ }
  const addressRoutes = addresses.map((addr) => ({ url: `${BASE}/address/${addr}`, changeFrequency: "daily" as const, priority: 0.5 }));

  return [...staticRoutes, ...addressRoutes];
}
