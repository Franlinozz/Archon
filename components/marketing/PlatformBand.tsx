"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Activity, Bot, Code2, Fingerprint, GitPullRequest, MapPin, Radar, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, instant, staggerContainer, viewportOnce } from "@/lib/motion";

// V5.8 (B) — a restrained "platform" band woven into the existing rhythm, after
// the three pillars. Signals depth (the V4 surfaces) without bloating: four
// headline capabilities, then three smaller ones. Every live capability links
// to its real surface; nothing here is design-only (no staked challenges).

// The registry is the only on-chain-known address (Archon's own, dog-fooded) —
// a real, honest example of an address profile.
const EXAMPLE_ADDRESS = "0xe7043e2ec95ef357fbba3359ba2f1edb10cead2a";

type Capability = { icon: LucideIcon; title: string; sentence: string; href: string; external?: boolean };

const HEADLINE: Capability[] = [
  { icon: Radar, title: "Sentinel", sentence: "Continuous monitoring re-scans watched Mantle contracts the moment their bytecode drifts.", href: "/app/sentinel" },
  { icon: Activity, title: "Gas Observatory", sentence: "The public source of truth for Mantle DA economics — oracle estimate vs. receipt ground truth, live.", href: "/observatory" },
  { icon: GitPullRequest, title: "CI & GitHub App", sentence: "Gas and security checks on every pull request, with safe, reviewable autofix commits.", href: "/docs/gas-optimizer/ci-github-action" },
  { icon: Bot, title: "Agent Trust API + MCP", sentence: "A signed security verdict any agent can query over REST or MCP — Archon as an agent's security sense.", href: "/api-reference" },
];

const SECONDARY: Capability[] = [
  { icon: Fingerprint, title: "Verified Builds", sentence: "Source-to-bytecode attestations anyone can re-check.", href: "/app/attest" },
  { icon: Code2, title: "VS Code extension", sentence: "Findings in your editor — published on Open VSX.", href: "https://open-vsx.org/extension/archon/archon-mantle", external: true },
  { icon: MapPin, title: "Address pages + badges", sentence: "A public security profile and embeddable badge per contract.", href: `/address/${EXAMPLE_ADDRESS}` },
];

export function PlatformBand() {
  const reduce = useReducedMotion();

  return (
    <section className="mx-auto max-w-7xl px-6 py-20 md:py-28">
      <motion.div variants={instant(fadeUp, reduce)} initial={reduce ? false : "hidden"} whileInView="show" viewport={viewportOnce}>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-500">Capabilities</p>
        <h2 className="mt-3 max-w-xl font-display text-4xl tracking-[-0.03em] text-ink md:text-5xl">A platform, not a point tool.</h2>
      </motion.div>

      <motion.div
        className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={instant(staggerContainer, reduce)}
        initial={reduce ? false : "hidden"}
        whileInView="show"
        viewport={viewportOnce}
      >
        {HEADLINE.map((c) => <HeadlineCard key={c.title} {...c} reduce={!!reduce} />)}
      </motion.div>

      <motion.div
        className="mt-4 grid gap-3 sm:grid-cols-3"
        variants={instant(staggerContainer, reduce)}
        initial={reduce ? false : "hidden"}
        whileInView="show"
        viewport={viewportOnce}
      >
        {SECONDARY.map((c) => <SecondaryCard key={c.title} {...c} reduce={!!reduce} />)}
      </motion.div>
    </section>
  );
}

function CardShell({ href, external, children, className }: { href: string; external?: boolean; children: React.ReactNode; className: string }) {
  if (external) return <a href={href} target="_blank" rel="noreferrer" className={className}>{children}</a>;
  return <Link href={href} className={className}>{children}</Link>;
}

function HeadlineCard({ icon: Icon, title, sentence, href, external, reduce }: Capability & { reduce: boolean }) {
  return (
    <motion.div variants={instant(fadeUp, reduce)} className="h-full">
      <CardShell href={href} external={external} className="archon-card-lift group flex h-full flex-col rounded-card border border-border-subtle bg-surface-1 p-6 shadow-card">
        <span className="w-fit rounded-control border border-brand-500/25 bg-brand-50 p-2 text-brand-500"><Icon size={18} aria-hidden /></span>
        <h3 className="mt-5 text-lg font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-body">{sentence}</p>
        <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-brand-500">
          {external ? "Open VSX" : "Explore"} {external ? <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden /> : <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />}
        </span>
      </CardShell>
    </motion.div>
  );
}

function SecondaryCard({ icon: Icon, title, sentence, href, external, reduce }: Capability & { reduce: boolean }) {
  return (
    <motion.div variants={instant(fadeUp, reduce)} className="h-full">
      <CardShell href={href} external={external} className="archon-card-lift group flex h-full items-start gap-3 rounded-card border border-border-subtle bg-surface-1/70 p-4">
        <span className="mt-0.5 shrink-0 text-muted transition-colors group-hover:text-brand-500"><Icon size={16} aria-hidden /></span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-sm font-semibold text-body group-hover:text-ink">{title}{external ? <ArrowUpRight size={12} className="text-muted" aria-hidden /> : null}</span>
          <span className="mt-1 block text-xs leading-5 text-muted">{sentence}</span>
        </span>
      </CardShell>
    </motion.div>
  );
}
