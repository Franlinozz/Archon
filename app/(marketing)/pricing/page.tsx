import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Reveal } from "@/components/motion";

// Business model surface (R3.4): three tiers that mirror how the product is
// actually built — public verification stays free forever, depth and CI/API
// throughput are what get priced. Prices are explicitly indicative, and the
// hackathon-period banner makes "everything is free right now" unmissable.
export const metadata: Metadata = {
  title: "Archon — Pricing",
  description: "Free verification forever. Pay for depth, measured runs, and CI/API throughput. All tiers free during the hackathon period.",
};

type Tier = {
  name: string;
  price: string;
  cadence: string | null;
  blurb: string;
  features: string[];
  cta: { label: string; href: string };
  highlighted?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "Audit intelligence and public verification for every Mantle builder.",
    features: [
      "Capped quick scans per month",
      "Severity-ranked findings with explanations",
      "Public proof verification — always free, no wallet",
      "Gas leaderboard access",
      "Community docs & whitepaper",
    ],
    cta: { label: "Start a scan", href: "/app/audit/new" },
  },
  {
    name: "Pro",
    price: "$49",
    cadence: "per seat / month — indicative",
    blurb: "Depth and evidence for teams shipping protocols to Mantle Mainnet.",
    features: [
      "Deep + full-report scans, uncapped",
      "Receipt-calibrated gas reports & validated patches",
      "Anchored on-chain proofs (ArchonProofRegistry)",
      "Generated Foundry regression tests",
      "Creator workspace & report history",
    ],
    cta: { label: "Start with Pro features", href: "/app/audit/new" },
    highlighted: true,
  },
  {
    name: "CI + API",
    price: "Metered",
    cadence: "per scan — indicative",
    blurb: "The full pipeline inside your automation: CLI, GitHub Action, and REST API.",
    features: [
      "archon-scan CLI with --fail-on gates",
      "Gas-diff GitHub Action on every PR",
      "REST API with OpenAPI 3.1 reference",
      "Webhook delivery for finished scans",
      "Volume pricing for indexers & auditors",
    ],
    cta: { label: "Read the API reference", href: "/api-reference" },
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-16 text-text-hi md:py-24">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-500">Pricing</p>
        <h1 className="mt-3 max-w-2xl font-display text-5xl tracking-[-0.04em] text-ink md:text-7xl">Verification is free. Depth is the product.</h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-body">Anyone can verify an Archon proof, forever, without an account. Teams pay for scan depth, measured gas evidence, and CI throughput.</p>
      </Reveal>

      <Reveal className="mt-8">
        <div className="inline-flex items-center gap-2 rounded-pill border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
          <span className="relative flex size-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" /><span className="relative inline-flex size-2 rounded-full bg-success" /></span>
          Hackathon period: all tiers are free — no payments are collected today.
        </div>
      </Reveal>

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {TIERS.map((tier) => (
          <Reveal key={tier.name} className="h-full">
            <article className={`flex h-full flex-col rounded-card border p-6 shadow-card ${tier.highlighted ? "border-brand-500/40 bg-brand-50" : "border-border-subtle bg-surface-1"}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xl font-semibold text-ink">{tier.name}</h2>
                {tier.highlighted ? <span className="rounded-pill border border-brand-500/30 bg-brand-100 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700">Most depth</span> : null}
              </div>
              <p className="mt-4 font-mono text-4xl text-ink">{tier.price}</p>
              {tier.cadence ? <p className="mt-1 text-xs text-muted">{tier.cadence}</p> : null}
              <p className="mt-4 text-sm leading-6 text-body">{tier.blurb}</p>
              <ul className="mt-5 space-y-2.5 text-sm text-body">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-brand-500" aria-hidden />{feature}</li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                <Link href={tier.cta.href} className={`block rounded-control px-4 py-2.5 text-center text-sm font-semibold transition-colors ${tier.highlighted ? "bg-green-400 text-on-green hover:bg-green-300" : "border border-border-subtle text-body hover:border-border-emphasis hover:text-ink"}`}>
                  {tier.cta.label}
                </Link>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-10">
        <p className="max-w-3xl text-xs leading-5 text-muted">
          Prices are indicative and may change before general availability; no tier is billed during the hackathon period. Public proof verification, the gas leaderboard, and report verification at <Link href="/proofs" className="text-brand-500 hover:text-brand-600">/proofs</Link> remain free in every tier, permanently — trust surfaces are not a paywall.
        </p>
      </Reveal>
    </main>
  );
}
