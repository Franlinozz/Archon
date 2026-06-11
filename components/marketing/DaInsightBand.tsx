"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, instant, viewportOnce } from "@/lib/motion";

// The insight no other audit tool leads with — told the way OUR receipts tell
// it. Receipt-calibrated pricing shows DA is a rounding error on Mantle, so the
// honest story is the inversion: execution is the bill. (The fashionable
// "your gas is mostly data" line is what the legacy oracle wrongly suggests.)
type DaInsightProps = {
  daLabel: string;
  l2Label: string;
  reportCount: number;
};

export function DaInsightBand({ daLabel, l2Label, reportCount }: DaInsightProps) {
  const reduce = useReducedMotion();

  return (
    <section className="relative border-y border-border-subtle bg-surface-1/70">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,197,94,0.14),transparent_36%),radial-gradient(circle_at_85%_100%,rgba(34,197,94,0.07),transparent_32%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-20 md:py-28">
        <motion.div variants={instant(fadeUp, reduce)} initial={reduce ? false : "hidden"} whileInView="show" viewport={viewportOnce} className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-500">Mantle gas economics</p>
          <h2 className="mt-3 font-display text-4xl tracking-[-0.03em] text-ink md:text-5xl">Your gas bill is execution. Data is nearly free.</h2>
          <p className="mt-4 text-sm leading-7 text-body md:text-lg md:leading-8">
            Legacy L1-fee oracles overstate Mantle&apos;s DA cost by orders of magnitude. Archon prices DA from real transaction receipts and splits every report into L2 execution versus DA — so you optimize the slice that actually costs money.
          </p>
        </motion.div>

        <motion.div
          variants={instant(fadeUp, reduce)}
          initial={reduce ? false : "hidden"}
          whileInView="show"
          viewport={viewportOnce}
          className="mt-10"
        >
          <div className="flex items-baseline justify-between gap-4 font-mono text-xs text-muted">
            <span className="text-brand-500">L2 execution · {l2Label}</span>
            <span className="text-warning">DA · {daLabel}</span>
          </div>
          <div className="mt-2 flex h-10 gap-1 overflow-hidden rounded-card border border-border-subtle bg-terminal p-1">
            <motion.span
              className="origin-left rounded-[8px]"
              style={{ width: "calc(100% - 10px)", background: "linear-gradient(90deg, var(--brand-600), var(--brand-400))" }}
              initial={reduce ? false : { scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={viewportOnce}
              transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
            <span aria-hidden className="w-1.5 shrink-0 rounded-[8px]" style={{ background: "var(--warning)" }} />
          </div>
          <p className="mt-3 max-w-3xl font-mono text-[11px] leading-5 text-muted">
            Aggregate per-call fee split across {reportCount} completed gas reports, priced from Mantle receipt ground truth (<span className="text-text-code">l1Fee</span>). DA share shown wider than scale for visibility.
          </p>
          <Link href="/docs/gas-optimizer/how-mantle-gas-works" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-500 hover:text-brand-600">
            How Mantle gas works <ArrowRight size={14} aria-hidden />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
