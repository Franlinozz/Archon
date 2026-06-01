"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EASE, viewportOnce } from "@/lib/motion";
import { CountUp } from "@/components/motion";

export type Hotspot = { name: string; value: number };

const VB = 240;
const CX = 120;
const CY = 120;
const R_OUT = 92;
const R_IN = 56;
const POP = 6; // px outward pop on hover

// Green-led scale ending in info blue, from theme tokens.
const PALETTE = ["var(--brand-600)", "var(--brand-400)", "var(--brand-300)", "var(--info)"];
const lighter = (c: string, amt: number) => `color-mix(in srgb, ${c} ${100 - amt}%, white)`;

function sectorPath(a0: number, a1: number) {
  const pt = (r: number, a: number) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(R_OUT, a0);
  const [x1, y1] = pt(R_OUT, a1);
  const [x2, y2] = pt(R_IN, a1);
  const [x3, y3] = pt(R_IN, a0);
  return `M${x0} ${y0} A${R_OUT} ${R_OUT} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${R_IN} ${R_IN} 0 ${large} 0 ${x3} ${y3} Z`;
}

export function GasHotspotsDonut({ data, total }: { data: Hotspot[]; total: number }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);

  // Precompute each slice's path, color, and outward pop vector once.
  const slices = useMemo(() => {
    const sum = data.reduce((s, d) => s + d.value, 0) || 1;
    let a = -Math.PI / 2; // start at top
    return data.map((d, i) => {
      const sweep = (d.value / sum) * Math.PI * 2;
      const a0 = a;
      const a1 = a + sweep;
      a = a1;
      const mid = (a0 + a1) / 2;
      const pct = Math.round((d.value / sum) * 100);
      return {
        name: d.name,
        pct,
        spend: Math.round((d.value / sum) * total),
        color: PALETTE[i % PALETTE.length]!,
        path: sectorPath(a0, a1),
        off: { x: Math.cos(mid) * POP, y: Math.sin(mid) * POP },
      };
    });
  }, [data, total]);

  const active = hover !== null ? slices[hover] : null;

  return (
    <div className="relative grid place-items-center">
      {/* Tilt only this wrapper; the centre label stays on an untilted layer. */}
      <div style={{ perspective: "900px" }}>
        <motion.div
          style={{ transformStyle: "preserve-3d", transform: reduce ? "none" : "rotateX(7deg)" }}
          initial={reduce ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={viewportOnce}
          transition={{ duration: 0.3 }}
        >
          <svg viewBox={`0 0 ${VB} ${VB}`} width="240" height="240" className="overflow-visible" role="img" aria-label="Gas hotspots by contract (sample data)">
            <defs>
              {slices.map((s, i) => (
                <linearGradient key={i} id={`donut-${i}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={lighter(s.color, 22)} />
                  <stop offset="100%" stopColor={s.color} />
                </linearGradient>
              ))}
              <radialGradient id="donut-hole" cx="50%" cy="50%" r="50%">
                <stop offset="62%" stopColor="rgba(0,0,0,0)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.22)" />
              </radialGradient>
              <filter id="donut-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="5" stdDeviation="6" style={{ floodColor: "var(--chart-shadow)" }} floodOpacity="1" />
              </filter>
            </defs>

            <g filter="url(#donut-shadow)">
              {slices.map((s, i) => (
                <motion.g
                  key={s.name}
                  style={{ transformBox: "view-box", transformOrigin: `${CX}px ${CY}px` }}
                  initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={viewportOnce}
                  transition={{ duration: 0.35, ease: EASE, delay: reduce ? 0 : i * 0.1 }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                >
                  <path
                    d={s.path}
                    fill={`url(#donut-${i})`}
                    stroke="var(--surface-1)"
                    strokeWidth="1.5"
                    style={{
                      transform: hover === i && !reduce ? `translate(${s.off.x}px, ${s.off.y}px)` : "translate(0,0)",
                      opacity: hover === null || hover === i ? 1 : 0.6,
                      transition: "transform 0.18s ease, opacity 0.18s ease",
                    }}
                  />
                </motion.g>
              ))}
              {/* inner-shadow on the hole */}
              <circle cx={CX} cy={CY} r={R_IN} fill="url(#donut-hole)" pointerEvents="none" />
            </g>
          </svg>
        </motion.div>
      </div>

      {/* Centre label — untilted for crisp text; cross-fades to the hovered slice. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div key={active.name} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
              <p className="max-w-[7rem] text-xs font-semibold text-text-hi">{active.name}</p>
              <p className="font-mono text-lg text-brand-500">{active.pct}%</p>
              <p className="text-xs text-text-low">${active.spend} · sample</p>
            </motion.div>
          ) : (
            <motion.div key="total" initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
              <p className="text-xs uppercase tracking-[0.12em] text-text-low">Total gas</p>
              <p className="font-mono text-2xl font-bold text-text-hi"><CountUp value={`$${total}`} /></p>
              <p className="text-xs text-text-low">sample</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
