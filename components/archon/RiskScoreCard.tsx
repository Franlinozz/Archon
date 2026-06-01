"use client";

import { motion, useReducedMotion } from "framer-motion";
import { SeverityPill } from "./SeverityPill";
import type { Severity } from "./severity";
import { CountUp } from "@/components/motion";
import { EASE, viewportOnce } from "@/lib/motion";

export function RiskScoreCard({ score = 72, severity = "high" as Severity }) {
  const reduce = useReducedMotion();
  const lit = Math.max(0, Math.min(5, Math.round(score / 20)));

  return (
    <section className="archon-card-lift rounded-card border border-border-subtle bg-surface-1 p-5">
      <div className="text-xs uppercase tracking-[0.12em] text-green-400">Risk score</div>
      <div className="mt-4 flex items-end gap-3">
        <span className="font-mono text-5xl text-text-hi"><CountUp value={String(score)} /></span>
        <span className="mb-2 font-mono text-text-low">/100</span>
        <SeverityPill severity={severity} />
      </div>
      <motion.div
        className="mt-5 grid grid-cols-5 gap-1"
        initial={reduce ? false : "hidden"}
        whileInView="show"
        viewport={viewportOnce}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const active = i < lit;
          return (
            <motion.div
              key={i}
              className={`h-2 origin-left rounded-pill ${active ? "bg-green-400" : "bg-surface-3"}`}
              variants={
                active
                  ? { hidden: { scaleX: reduce ? 1 : 0 }, show: { scaleX: 1, transition: { duration: 0.35, ease: EASE } } }
                  : { hidden: { scaleX: 1 }, show: { scaleX: 1 } }
              }
            />
          );
        })}
      </motion.div>
      <a className="mt-4 inline-block text-sm text-green-400" href="#risk-formula">How is this calculated?</a>
    </section>
  );
}
