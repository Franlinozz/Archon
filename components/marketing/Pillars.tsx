"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, FileSearch, Gauge, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, instant, staggerContainer, viewportOnce } from "@/lib/motion";
import type { SeverityCounts } from "@/lib/marketing/stats";

// Three pillars — icon, four-word title, ONE sentence, micro-visual. The
// micro-visuals draw from real production data passed in by the server page;
// when data is unavailable they are omitted rather than faked.

const SEVERITY_ORDER: Array<{ key: keyof SeverityCounts; color: string; label: string }> = [
  { key: "critical", color: "var(--danger)", label: "critical" },
  { key: "high", color: "var(--high)", label: "high" },
  { key: "medium", color: "var(--warning)", label: "medium" },
  { key: "low", color: "var(--info)", label: "low" },
  { key: "info", color: "var(--muted)", label: "info" },
];

type PillarsProps = {
  severity: SeverityCounts | null;
  findingsTotal: string | null;
  scansTotal: string | null;
  da: { daLabel: string; l2Label: string } | null;
  latestHash: string | null;
};

export function Pillars({ severity, findingsTotal, scansTotal, da, latestHash }: PillarsProps) {
  const reduce = useReducedMotion();

  return (
    <section id="product" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-20 md:py-28">
      <motion.div variants={instant(fadeUp, reduce)} initial={reduce ? false : "hidden"} whileInView="show" viewport={viewportOnce}>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-500">Platform</p>
        <h2 className="mt-3 max-w-xl font-display text-4xl tracking-[-0.03em] text-ink md:text-5xl">One pipeline, three kinds of evidence.</h2>
      </motion.div>

      <motion.div
        className="mt-10 grid gap-4 md:grid-cols-3"
        variants={instant(staggerContainer, reduce)}
        initial={reduce ? false : "hidden"}
        whileInView="show"
        viewport={viewportOnce}
      >
        <PillarCard icon={FileSearch} title="Deterministic audit findings" href="/app/audit/new" sentence="Static analysis, Mantle-specific rules, and bounded AI reasoning produce severity-ranked findings with generated Foundry tests.">
          {severity ? <SeverityBar severity={severity} findingsTotal={findingsTotal} scansTotal={scansTotal} reduce={!!reduce} /> : null}
        </PillarCard>

        <PillarCard icon={Gauge} title="Receipt-calibrated gas pricing" href="/app/gas" sentence="Every optimization is priced from Mantle receipt ground truth and split into L2 execution versus DA — never a stale oracle.">
          {da ? <SplitBar da={da} reduce={!!reduce} /> : null}
        </PillarCard>

        <PillarCard icon={BadgeCheck} title="Anchored, verifiable reports" href="/proofs" sentence="Canonical report hashes anchor to the ArchonProofRegistry on Mantle Mainnet, and anyone can re-verify them without a wallet.">
          {latestHash ? <HashCheck hash={latestHash} /> : null}
        </PillarCard>
      </motion.div>
    </section>
  );
}

function PillarCard({ icon: Icon, title, sentence, href, children }: { icon: LucideIcon; title: string; sentence: string; href: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div variants={instant(fadeUp, reduce)} className="h-full">
      <Link href={href} className="archon-card-lift group flex h-full flex-col rounded-card border border-border-subtle bg-surface-1 p-6 shadow-card">
        <span className="w-fit rounded-control border border-brand-500/25 bg-brand-50 p-2 text-brand-500"><Icon size={18} aria-hidden /></span>
        <h3 className="mt-5 text-xl font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-body">{sentence}</p>
        <div className="mt-auto pt-5">{children}</div>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-500">Open <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
      </Link>
    </motion.div>
  );
}

/** Real severity distribution as a stacked bar (scaleX entrance, transform-only). */
function SeverityBar({ severity, findingsTotal, scansTotal, reduce }: { severity: SeverityCounts; findingsTotal: string | null; scansTotal: string | null; reduce: boolean }) {
  const total = SEVERITY_ORDER.reduce((sum, s) => sum + severity[s.key], 0);
  if (total === 0) return null;
  return (
    <div>
      <motion.div
        className="flex h-2 origin-left gap-px overflow-hidden rounded-pill"
        initial={reduce ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={viewportOnce}
        transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {SEVERITY_ORDER.map((s) => (severity[s.key] > 0 ? <span key={s.key} title={`${severity[s.key]} ${s.label}`} style={{ width: `${(severity[s.key] / total) * 100}%`, background: s.color, minWidth: 3 }} /> : null))}
      </motion.div>
      {findingsTotal ? <p className="mt-2 font-mono text-[11px] text-muted">{findingsTotal} findings{scansTotal ? ` across ${scansTotal} completed scans` : ""}</p> : null}
    </div>
  );
}

/** L2-execution vs DA split — DA renders as a hairline because that is the real ratio. */
function SplitBar({ da, reduce }: { da: { daLabel: string; l2Label: string }; reduce: boolean }) {
  return (
    <div>
      <div className="flex h-2 gap-px overflow-hidden rounded-pill">
        <motion.span
          className="origin-left rounded-l-pill"
          style={{ width: "calc(100% - 4px)", background: "linear-gradient(90deg, var(--brand-600), var(--brand-400))" }}
          initial={reduce ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={viewportOnce}
          transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
        <span className="w-[3px] shrink-0 rounded-r-pill" style={{ background: "var(--warning)" }} title={`DA ${da.daLabel} of per-call fees`} />
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted">L2 execution {da.l2Label} · DA {da.daLabel}</p>
    </div>
  );
}

/** Latest anchored report hash with its verification tick — shown, not claimed. */
function HashCheck({ hash }: { hash: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-control border border-border-subtle bg-terminal px-3 py-2">
      <span className="truncate font-mono text-[11px] text-text-code">{hash}</span>
      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-success"><BadgeCheck size={12} aria-hidden /> anchored</span>
    </div>
  );
}
