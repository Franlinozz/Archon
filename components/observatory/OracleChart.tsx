import type { ObservatorySnapshot } from "@/lib/observatory/stats";

// Server-rendered inline SVG so it embeds in an <iframe> with zero hydration.
// Oracle prediction is ~1/2,500th of the charged receipt fee, so a linear axis
// renders it as a sliver beside a full receipt bar — the divergence IS the
// visual, the same story as ADR 0007's Table 1, made into a time series.
type Row = ObservatorySnapshot["oracle"]["series"][number];

export function OracleChart({ series, anchors, height = 280 }: { series: Row[]; anchors: ObservatorySnapshot["oracle"]["anchors"]; height?: number }) {
  // Fall back to the verified anchors when live oracle samples are still thin.
  const rows = series.length >= 2
    ? series.map((s) => ({ label: s.bucket.slice(5), actual: s.actualGwei ?? 0, oracle: s.oracleGwei ?? 0 }))
    : anchors.map((a) => ({ label: a.txShort, actual: a.actualMnt * 1e9, oracle: a.oracleMnt * 1e9 }));
  const max = Math.max(...rows.map((r) => r.actual), 1);
  const W = 720, H = height, padL = 48, padB = 28, padT = 16, padR = 16;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const bw = innerW / rows.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" font-family="ui-sans-serif,system-ui,sans-serif" role="img" aria-label="Mantle legacy oracle prediction vs charged receipt DA fee">
      <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="var(--border-subtle, #334)" />
      <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="var(--border-subtle, #334)" />
      {rows.map((r, i) => {
        const x = padL + i * bw;
        const ah = (r.actual / max) * innerH;
        const oh = Math.max((r.oracle / max) * innerH, r.oracle > 0 ? 1.5 : 0);
        const cx = x + bw / 2;
        return (
          <g key={i}>
            <rect x={cx - bw * 0.3} y={padT + innerH - ah} width={bw * 0.26} height={ah} fill="#16A06B" rx="2" />
            <rect x={cx + bw * 0.04} y={padT + innerH - oh} width={bw * 0.26} height={oh} fill="#E08A00" rx="2" />
            <text x={cx} y={H - 10} fontSize="9" fill="var(--muted, #889)" textAnchor="middle">{r.label}</text>
          </g>
        );
      })}
      <text x={padL} y={11} fontSize="10" fill="var(--muted, #889)">DA fee / byte (gwei) — receipt (green) vs legacy oracle (amber)</text>
    </svg>
  );
}
