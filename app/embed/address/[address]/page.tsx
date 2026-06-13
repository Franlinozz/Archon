import type { Metadata } from "next";
import { isAddress } from "viem";
import { getAddressProfile } from "@/lib/address/profile";

// Chrome-less compact security card for project sites (iframe). One line of HTML:
// <iframe src="https://archonaudit.xyz/embed/address/0x…" width="320" height="92" style="border:0">
export const revalidate = 300;
export const metadata: Metadata = { title: "Archon security card", robots: { index: false } };
const short = (v: string) => `${v.slice(0, 8)}…${v.slice(-6)}`;

export default async function AddressEmbed({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const p = isAddress(address) ? await getAddressProfile(address).catch(() => null) : null;
  const color = p?.latestRisk == null ? "#6B7A73" : p.latestRisk >= 67 ? "#D64545" : p.latestRisk >= 34 ? "#E08A00" : "#16A06B";
  return (
    <a href={`https://archonaudit.xyz/address/${address}`} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", fontFamily: "ui-sans-serif,system-ui,sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, border: "1px solid #DCE8E1", borderRadius: 12, background: "#fff", color: "#0B1A14" }}>
        <div style={{ width: 48, height: 48, borderRadius: 10, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, fontFamily: "monospace" }}>{p?.latestRisk ?? "—"}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{p?.contractName ?? short(address)}</div>
          <div style={{ fontSize: 11, color: "#46544D" }}>{p?.known ? `Archon risk ${p.latestRisk ?? "—"}${p.reports.some((r) => r.anchored) ? " · proof ✓" : ""}${p.attestation ? " · attested" : ""}` : "Not yet scanned by Archon"}</div>
          <div style={{ fontSize: 10, color: "#16A06B", marginTop: 2 }}>verify on archonaudit.xyz →</div>
        </div>
      </div>
    </a>
  );
}
