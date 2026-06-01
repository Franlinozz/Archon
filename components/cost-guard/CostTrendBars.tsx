"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE, viewportOnce } from "@/lib/motion";

export type TrendPoint = { day: string; gas: number; infra: number; ai: number };

// Green-led series palette, driven from theme tokens.
const SERIES = [
  { key: "gas", label: "Gas", base: "var(--brand-600)" },
  { key: "infra", label: "Infrastructure", base: "var(--brand-400)" },
  { key: "ai", label: "AI Token", base: "var(--info)" },
] as const;

// Layered-SVG geometry. Plenty of right/top padding so the extrusion + drop
// shadow never clip (overflow stays visible too).
const VB_W = 600;
const VB_H = 300;
const PAD = { left: 18, right: 44, top: 26, bottom: 38 };
const DEPTH = 9; // px of fake extrusion (top cap + side sliver)
const CHART_H = VB_H - PAD.top - PAD.bottom;
const CHART_W = VB_W - PAD.left - PAD.right;
const BAR_W = 38;

const lighter = (c: string, amt: number) => `color-mix(in srgb, ${c} ${100 - amt}%, white)`;
const darker = (c: string, amt: number) => `color-mix(in srgb, ${c} ${100 - amt}%, black)`;

export function CostTrendBars({ data }: { data: TrendPoint[] }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);

  const totals = data.map((d) => d.gas + d.infra + d.ai);
  const maxTotal = Math.max(1, ...totals);
  const scale = CHART_H / (maxTotal * 1.1); // headroom
  const baseline = PAD.top + CHART_H;
  const slot = CHART_W / data.length;
  const barX = (i: number) => PAD.left + slot * i + (slot - BAR_W) / 2;

  return (
    <div className="relative">
      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-text-mid">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.base }} />
            {s.label}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" className="h-72 overflow-visible" role="img" aria-label="Stacked cost trend by day (sample data)">
        <defs>
          {SERIES.map((s) => (
            <linearGradient key={s.key} id={`bar-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lighter(s.base, 18)} />
              <stop offset="100%" stopColor={s.base} />
            </linearGradient>
          ))}
          <filter id="bar-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="7" style={{ floodColor: "var(--chart-shadow)" }} floodOpacity="1" />
          </filter>
        </defs>

        {/* gridlines */}
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={PAD.left} x2={VB_W - PAD.right} y1={baseline - CHART_H * t} y2={baseline - CHART_H * t} stroke="var(--border-subtle)" strokeWidth="1" />
        ))}
        <line x1={PAD.left} x2={VB_W - PAD.right} y1={baseline} y2={baseline} stroke="var(--border-emphasis)" strokeWidth="1" />

        {data.map((d, i) => {
          const x = barX(i);
          const segs = SERIES.map((s) => ({ ...s, value: d[s.key as keyof TrendPoint] as number }));
          let cursor = baseline;
          return (
            <g
              key={d.day}
              style={{ transform: hover === i && !reduce ? "translateY(-2px)" : "translateY(0)", filter: hover === i ? "brightness(1.08)" : "none", transition: "transform 0.15s ease, filter 0.15s ease" }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            >
              {/* grow-up wrapper: scaleY 0→1 from the baseline */}
              <motion.g
                style={{ transformBox: "fill-box", transformOrigin: "bottom" }}
                initial={reduce ? false : { scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={viewportOnce}
                transition={{ duration: 0.55, ease: EASE, delay: reduce ? 0 : i * 0.06 }}
                filter="url(#bar-shadow)"
              >
                {segs.map((seg, segIndex) => {
                  const h = seg.value * scale;
                  if (h <= 0) return null;
                  const y = cursor - h;
                  cursor = y;
                  const top = segIndex === segs.length - 1; // topmost gets cap + rounding
                  const node = (
                    <g key={seg.key}>
                      {/* right side sliver (darker) */}
                      <polygon points={`${x + BAR_W},${y} ${x + BAR_W + DEPTH},${y - DEPTH} ${x + BAR_W + DEPTH},${y + h - DEPTH} ${x + BAR_W},${y + h}`} fill={darker(seg.base, 22)} />
                      {/* front face */}
                      <rect x={x} y={y} width={BAR_W} height={h} rx={top ? 4 : 0} fill={`url(#bar-${seg.key})`} />
                      {/* top cap (lighter) only on the topmost segment */}
                      {top ? <polygon points={`${x},${y} ${x + DEPTH},${y - DEPTH} ${x + BAR_W + DEPTH},${y - DEPTH} ${x + BAR_W},${y}`} fill={lighter(seg.base, 32)} /> : null}
                    </g>
                  );
                  return node;
                })}
              </motion.g>
              {/* day label */}
              <text x={x + BAR_W / 2} y={baseline + 20} textAnchor="middle" className="fill-text-low" style={{ fontSize: 12 }}>{d.day}</text>
            </g>
          );
        })}
      </svg>

      {/* Floating tooltip on the untilted HTML layer. */}
      {hover !== null && data[hover] ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-card border border-border-subtle bg-surface-1 px-3 py-2 text-xs shadow-lift"
          style={{ left: `${((barX(hover) + BAR_W / 2) / VB_W) * 100}%`, top: 8 }}
        >
          <p className="mb-1 font-semibold text-text-hi">{data[hover]!.day} · ${totals[hover]} <span className="text-text-low">sample</span></p>
          {SERIES.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-4 text-text-mid">
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: s.base }} />{s.label}</span>
              <span className="font-mono text-text-hi">{data[hover]![s.key as keyof TrendPoint] as number}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
