"use client";

import { useState } from "react";
import type { ObservatorySnapshot } from "@/lib/observatory/stats";

// B.3 — interactive oracle-vs-receipt panel for the Observatory page (the iframe
// embed keeps the zero-hydration OracleChart). The legacy oracle predicts ~1/2,500th
// of the charged DA fee, so on a linear axis the amber bar is a sliver — honest, but
// reads as a broken render. A log toggle reveals the amber bar has real height; each
// pair is annotated with the divergence; hover shows exact values. 2D, trading-panel feel.
type Row = ObservatorySnapshot["oracle"]["series"][number];

export function OracleChartPanel({ series, anchors }: { series: Row[]; anchors: ObservatorySnapshot["oracle"]["anchors"] }) {
  const [scale, setScale] = useState<"linear" | "log">("linear");
  const [hover, setHover] = useState<number | null>(null);

  const rows =
    series.length >= 2
      ? series.map((s) => ({ label: s.bucket.slice(5), actual: s.actualGwei ?? 0, oracle: s.oracleGwei ?? 0 }))
      : anchors.map((a) => ({ label: a.txShort, actual: a.actualMnt * 1e9, oracle: a.oracleMnt * 1e9 }));
  const max = Math.max(...rows.map((r) => r.actual), 1e-9);
  // Log domain spans the real data range (sub-1-gwei oracle → hundreds for receipt),
  // with a margin below the smallest value so the amber bar keeps proportionate height
  // instead of collapsing to the floor.
  const positives = rows.flatMap((r) => [r.actual, r.oracle]).filter((v) => v > 0);
  const lo = positives.length ? Math.min(...positives) : 1;
  const hi = Math.max(...positives, lo * 10);
  const logLo = Math.log10(lo) - 0.4;
  const logHi = Math.log10(hi);

  const W = 760, H = 320, padL = 40, padB = 46, padT = 30, padR = 16;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const bw = innerW / rows.length;
  const barH = (v: number) => {
    if (v <= 0) return 0;
    const frac = scale === "log" ? (Math.log10(v) - logLo) / (logHi - logLo) : v / max;
    return Math.max(Math.min(frac, 1) * innerH, 2);
  };
  const fmt = (v: number) => (v === 0 ? "0" : v < 0.001 ? v.toExponential(1) : v.toLocaleString("en-US", { maximumFractionDigits: 3 }));
  const tipX = (cx: number) => Math.min(Math.max(cx - 82, padL), W - padR - 168);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted">DA fee / byte (gwei) — <span className="text-success">receipt (charged)</span> vs <span className="text-warning">legacy oracle</span></p>
        <div className="inline-flex overflow-hidden rounded-control border border-border-subtle text-[11px]" role="group" aria-label="Axis scale">
          {(["linear", "log"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setScale(s)} aria-pressed={scale === s} className={scale === s ? "bg-brand-500/15 px-2.5 py-1 font-semibold text-brand-600" : "px-2.5 py-1 text-text-low hover:text-ink"}>{s}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Mantle legacy oracle prediction vs charged receipt DA fee over time">
        <defs>
          <linearGradient id="archon-recv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34F5B0" /><stop offset="100%" stopColor="#0E9E6E" /></linearGradient>
          <linearGradient id="archon-orac" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F79009" /><stop offset="100%" stopColor="#B45309" /></linearGradient>
          <filter id="archon-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={padL} y1={padT + innerH - g * innerH} x2={W - padR} y2={padT + innerH - g * innerH} stroke="var(--border-subtle)" strokeOpacity="0.3" strokeWidth="1" />
        ))}
        <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="var(--border-subtle)" />
        {rows.map((r, i) => {
          const x = padL + i * bw, cx = x + bw / 2;
          const ah = barH(r.actual), oh = barH(r.oracle);
          const ratio = r.oracle > 0 ? r.actual / r.oracle : null;
          const on = hover === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              <rect x={x} y={padT} width={bw} height={innerH} fill="transparent" />
              <rect x={cx - bw * 0.3} y={padT + innerH - ah} width={bw * 0.26} height={ah} fill="url(#archon-recv)" rx="3" filter={on ? "url(#archon-glow)" : undefined} />
              <rect x={cx + bw * 0.04} y={padT + innerH - oh} width={bw * 0.26} height={oh} fill="url(#archon-orac)" rx="3" />
              {ratio ? <text x={cx} y={padT + innerH - Math.max(ah, oh) - 6} fontSize="9" fill={on ? "var(--warning)" : "var(--muted)"} textAnchor="middle">{Math.round(ratio).toLocaleString()}×</text> : null}
              <text x={cx} y={H - 24} fontSize="9" fill="var(--muted)" textAnchor="middle">{r.label}</text>
              {on ? (
                <g pointerEvents="none">
                  <rect x={tipX(cx)} y={padT + 2} width="166" height="48" rx="6" fill="var(--surface-3)" stroke="var(--border-subtle)" />
                  <text x={tipX(cx) + 9} y={padT + 19} fontSize="9.5" fill="var(--text-hi)">receipt {fmt(r.actual)} gwei/byte</text>
                  <text x={tipX(cx) + 9} y={padT + 31} fontSize="9.5" fill="var(--text-mid)">oracle {fmt(r.oracle)} gwei/byte</text>
                  <text x={tipX(cx) + 9} y={padT + 44} fontSize="9.5" fill="var(--warning)">{ratio ? `${Math.round(ratio).toLocaleString()}× under-reported` : "no oracle sample"}</text>
                </g>
              ) : null}
            </g>
          );
        })}
        <text x={padL} y={16} fontSize="10" fill="var(--muted)">gwei / byte · {scale} scale{scale === "linear" ? " — toggle log to see the oracle bar" : ""}</text>
      </svg>
    </div>
  );
}
