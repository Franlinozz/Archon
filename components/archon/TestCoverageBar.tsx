"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EASE, viewportOnce } from "@/lib/motion";
import { CountUp } from "@/components/motion";

export function TestCoverageBar({ category = "Reentrancy", covered = 3, total = 4 }) {
  const reduce = useReducedMotion();
  const pct = Math.round((covered / total) * 100);
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-text-mid">{category}</span>
        <span className="font-mono text-text-hi">
          <CountUp value={String(covered)} />/{total} · <CountUp value={`${pct}%`} />
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-pill bg-surface-3">
        <motion.div
          className="h-2 origin-left rounded-pill bg-green-400"
          style={{ width: `${pct}%` }}
          initial={reduce ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5, ease: EASE }}
        />
      </div>
    </div>
  );
}
