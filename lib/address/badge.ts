import type { AddressProfile } from "@/lib/address/profile";

// Shields-style SVG badges (F7) — generated as code, no external service.
// Variants: audit (risk), attestation (build match), gas (rank/profile).
const BRAND = "#16A06B", GREY = "#555";
const sev = (risk: number | null) => (risk == null ? GREY : risk >= 67 ? "#D64545" : risk >= 34 ? "#E08A00" : BRAND);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const charW = 6.6;

function badge(label: string, value: string, valueColor: string): string {
  const lw = Math.round(label.length * charW) + 16;
  const vw = Math.round(value.length * charW) + 16;
  const w = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
<rect width="${lw}" height="20" fill="#2b2b2b"/>
<rect x="${lw}" width="${vw}" height="20" fill="${valueColor}"/>
<rect width="${w}" height="20" fill="url(#s)"/>
</g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(label)}</text>
<text x="${lw + vw / 2}" y="14">${esc(value)}</text>
</g></svg>`;
}

export function buildBadge(profile: AddressProfile, variant: string): string {
  if (variant === "attestation") {
    const v = profile.attestation ? (profile.attestation.matchType === "exact" ? "attested ✓" : "attested (meta)") : "not attested";
    return badge("Archon build", v, profile.attestation ? BRAND : GREY);
  }
  if (variant === "gas") {
    return badge("Archon gas", profile.gas ? "receipt-calibrated" : "no report", profile.gas ? BRAND : GREY);
  }
  // default: audit/risk
  if (!profile.known || profile.latestRisk == null) return badge("Archon", "no audit", GREY);
  const proof = profile.reports.some((r) => r.anchored) ? " · proof ✓" : "";
  return badge("Archon", `risk ${profile.latestRisk}${proof}`, sev(profile.latestRisk));
}
