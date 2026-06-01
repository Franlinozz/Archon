"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EASE, fadeUp, instant, staggerContainer, viewportOnce } from "@/lib/motion";

const STEPS = [
  ["1", "Scan Contract", "Read-only source or address intake on Mantle."],
  ["2", "Analyze Risk", "Static analysis, Mantle rules, AI explanation, tests."],
  ["3", "Log Proof On-chain", "IPFS metadata and ERC-8004 Reputation entry after explicit approval."],
] as const;

export function ThreeSteps() {
  const reduce = useReducedMotion();
  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <motion.h2
        className="text-2xl font-bold tracking-tight text-ink"
        variants={instant(fadeUp, reduce)}
        initial={reduce ? false : "hidden"}
        whileInView="show"
        viewport={viewportOnce}
      >
        From Code to On-chain Confidence in 3 Steps
      </motion.h2>

      <motion.div
        className="relative mt-5 grid gap-3 md:grid-cols-3"
        variants={instant(staggerContainer, reduce)}
        initial={reduce ? false : "hidden"}
        whileInView="show"
        viewport={viewportOnce}
      >
        {STEPS.map(([n, title, body], i) => (
          <div key={n} className="relative">
            <motion.div
              variants={instant(fadeUp, reduce)}
              className="archon-card-lift h-full rounded-card border border-border-subtle bg-surface-1 p-4"
            >
              <span className="grid size-7 place-items-center rounded-full bg-green-400 font-mono text-sm text-on-green">{n}</span>
              <h3 className="mt-3 text-base font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-body">{body}</p>
            </motion.div>

            {/* Connector that draws left→right into the next step (md+ only). */}
            {i < STEPS.length - 1 ? (
              <motion.span
                aria-hidden
                className="absolute right-[-0.5rem] top-1/2 hidden h-px w-4 origin-left bg-brand-500/50 md:block"
                initial={reduce ? false : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={viewportOnce}
                transition={{ duration: 0.4, ease: EASE, delay: reduce ? 0 : 0.2 + i * 0.06 }}
              />
            ) : null}
          </div>
        ))}
      </motion.div>
    </section>
  );
}
