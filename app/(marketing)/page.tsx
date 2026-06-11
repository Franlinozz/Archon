import type { Metadata } from "next";
import { Hero } from "@/components/marketing/Hero";
import { LiveProofStrip, type StripStat } from "@/components/marketing/LiveProofStrip";
import { Pillars } from "@/components/marketing/Pillars";
import { DaInsightBand } from "@/components/marketing/DaInsightBand";
import { ProofReceipt } from "@/components/marketing/ProofReceipt";
import { FinalCta } from "@/components/marketing/FinalCta";
import { daShareLabel, getLandingStats, shortHash } from "@/lib/marketing/stats";

// Landing structure (R2): hero → live proof strip → three pillars → DA insight
// → proof receipt → final CTA. Every number on this page is queried from the
// production database (revalidated every 60s); sections that depend on live
// data hide themselves rather than render placeholders.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Archon — Audit it. Optimize it. Prove it.",
  description: "AI-assisted audits and receipt-calibrated gas optimization for Mantle — every report anchored on-chain, verifiable by anyone.",
};

const fmt = (n: number) => n.toLocaleString("en-US");

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
      {da && stats?.daSplit ? <DaInsightBand daLabel={da.da} l2Label={da.l2} reportCount={stats.daSplit.reportCount} /> : null}
      <ProofReceipt proof={stats?.latestProof ?? null} />
      <FinalCta />
    </main>
  );
}
