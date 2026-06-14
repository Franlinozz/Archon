import type { Metadata } from "next";
import { Hero } from "@/components/marketing/Hero";
import { LiveProofStrip, type StripStat } from "@/components/marketing/LiveProofStrip";
import { Pillars } from "@/components/marketing/Pillars";
import { PlatformBand } from "@/components/marketing/PlatformBand";
import { DaInsightBand } from "@/components/marketing/DaInsightBand";
import { ProofReceipt } from "@/components/marketing/ProofReceipt";
import { ResourcesStrip } from "@/components/marketing/ResourcesStrip";
import { FinalCta } from "@/components/marketing/FinalCta";
import { daShareLabel, getLandingStats, ORACLE_DIVERGENCE, shortHash } from "@/lib/marketing/stats";

// Landing structure (R2): hero → live proof strip → three pillars → platform
// band (V5.8) → DA insight → proof receipt → resources strip (V5.8) → final CTA.
// Every number on this page is queried from the
// production database (revalidated every 60s); sections that depend on live
// data hide themselves rather than render placeholders.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Archon — Audit it. Optimize it. Prove it.",
  description: "AI-assisted audits and receipt-calibrated gas optimization for Mantle — every report anchored on-chain, verifiable by anyone.",
};

const fmt = (n: number) => n.toLocaleString("en-US");
const fmtMnt = (wei: bigint) => {
  const mnt = Number(wei) / 1e18;
  return mnt >= 0.0001 ? mnt.toFixed(6) : mnt.toFixed(9);
};
// Immutable verified facts (ADR 0007) — the oracle-vs-receipt comparison bars.
const divergenceRows = ORACLE_DIVERGENCE.rows.map((row) => ({
  txShort: row.txShort,
  bytes: row.bytes,
  actualMnt: fmtMnt(row.actualWei),
  oracleMnt: fmtMnt(row.oracleWei),
  underReportPct: row.underReportPct,
  oracleShare: Number(row.oracleWei) / Number(row.actualWei),
}));

export default async function MarketingHome() {
  const stats = await getLandingStats();
  const da = stats?.daSplit ? daShareLabel(stats.daSplit) : null;

  const strip: StripStat[] | null = stats
    ? [
        { value: fmt(stats.reportsAnchored), label: "Reports anchored on-chain", href: "/proofs" },
        { value: fmt(stats.findingsDetected), label: "Findings detected", href: "/proofs" },
        { value: fmt(stats.optimizationsSurfaced), label: "Gas optimizations surfaced", href: "/gas-leaderboard" },
        { value: "#97", label: "ERC-8004 agent on Mantle", href: "/docs/on-chain-proofs/erc-8004-identity" },
      ]
    : null;

  return (
    <main className="overflow-hidden text-text-hi">
      <Hero />
      {strip ? <LiveProofStrip stats={strip} /> : null}
      <Pillars
        severity={stats?.severity ?? null}
        findingsTotal={stats ? fmt(stats.findingsDetected) : null}
        scansTotal={stats ? fmt(stats.scansCompleted) : null}
        da={da ? { daLabel: da.da, l2Label: da.l2 } : null}
        latestHash={stats?.latestProof ? shortHash(stats.latestProof.reportHash, 12, 8) : null}
      />
      <PlatformBand />
      <DaInsightBand rows={divergenceRows} />
      <ProofReceipt proof={stats?.latestProof ?? null} />
      <ResourcesStrip />
      <FinalCta />
    </main>
  );
}
