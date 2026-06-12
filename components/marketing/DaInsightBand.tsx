"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, instant, viewportOnce } from "@/lib/motion";

// The insight no other Mantle tool leads with, told exactly as our receipts
// tell it (ADR 0007 / whitepaper v2 Table 1): the legacy fee oracle
// UNDER-reports the DA fee Mantle actually charges by ~2,200–2,900×. Archon
// prices DA from receipt ground truth (`l1Fee`) and labels every figure
// measured / estimated / unpriced. Bars below are real per-tx values.
type DivergenceRow = { txShort: string; bytes: number; actualMnt: string; oracleMnt: string; underReportPct: string; oracleShare: number };

export function DaInsightBand({ rows }: { rows: DivergenceRow[] }) {
  const reduce = useReducedMotion();

  return (
    <section className="relative border-y border-border-subtle bg-surface-1/70">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,197,94,0.14),transparent_36%),radial-gradient(circle_at_85%_100%,rgba(34,197,94,0.07),transparent_32%)]" />
      <div className="relative mx-auto max-w-7xl px-6 py-20 md:py-28">
        <motion.div variants={instant(fadeUp, reduce)} initial={reduce ? false : "hidden"} whileInView="show" viewport={viewportOnce} className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-500">Mantle gas economics</p>
          <h2 className="mt-3 font-display text-4xl tracking-[-0.03em] text-ink md:text-5xl">The legacy fee oracle is wrong by ~2,500×.</h2>
          <p className="mt-4 text-sm leading-7 text-body md:text-lg md:leading-8">
            On live Mantle transactions, <span className="font-mono text-sm text-text-code">GasPriceOracle.getL1Fee</span> under-reports the data-availability fee the chain actually charges by ~99.96%. Archon prices DA from receipt ground truth (<span className="font-mono text-sm text-text-code">l1Fee</span>) instead — and labels every number measured, estimated, or unpriced.
          </p>
        </motion.div>

        <motion.div variants={instant(fadeUp, reduce)} initial={reduce ? false : "hidden"} whileInView="show" viewport={viewportOnce} className="mt-10 space-y-7">
          {rows.map((row) => (
            <div key={row.txShort}>
              <p className="font-mono text-xs text-muted">tx {row.txShort} · {row.bytes} bytes</p>
              <div className="mt-2 space-y-1.5">
                <BarRow label="Receipt l1Fee (charged)" value={`${row.actualMnt} MNT`} share={1} accent reduce={!!reduce} />
                <BarRow label="Oracle getL1Fee (predicted)" value={`${row.oracleMnt} MNT — ${row.underReportPct} under`} share={row.oracleShare} accent={false} reduce={!!reduce} />
              </div>
            </div>
          ))}
          <p className="max-w-3xl font-mono text-[11px] leading-5 text-muted">
            Real Mantle Mainnet transactions; bar lengths to scale (the oracle bar is clamped to stay visible). Methodology, receipts, and validation error in ADR 0007.
          </p>
          <Link href="/docs/gas-optimizer/how-mantle-gas-works" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-500 hover:text-brand-600">
            How Mantle gas works <ArrowRight size={14} aria-hidden />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function BarRow({ label, value, share, accent, reduce }: { label: string; value: string; share: number; accent: boolean; reduce: boolean }) {
  // Oracle share is ~0.0004 of actual — clamp so the bar reads as "a sliver",
  // and say so in the caption rather than render an invisible 0px bar.
  const width = `${Math.max(share * 100, 0.4)}%`;
  return (
    <div className="grid items-center gap-3 md:grid-cols-[240px_1fr]">
      <span className="text-xs text-body">{label}</span>
      <div className="flex items-center gap-3">
        <div className="h-5 flex-1 overflow-hidden rounded-pill border border-border-subtle bg-terminal p-0.5">
          <motion.span
            className="block h-full origin-left rounded-pill"
            style={{ width, background: accent ? "linear-gradient(90deg, var(--brand-600), var(--brand-400))" : "var(--warning)" }}
            initial={reduce ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={viewportOnce}
            transition={{ duration: reduce ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <span className="w-56 shrink-0 font-mono text-[11px] text-muted">{value}</span>
      </div>
    </div>
  );
}
