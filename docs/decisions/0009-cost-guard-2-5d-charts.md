# ADR 0009: Cost Guard 2.5D charts — custom SVG over Recharts for the hero charts

Status: accepted
Date: 2026-06-01

## Context

The Cost Guard page read flat: stacked bars and the gas-hotspots donut were plain
Recharts primitives with no depth or motion. The UI polish brief (Session 4) asked for
a premium "2.5D" look — extruded bars, a tilted donut with depth, draw-in animation,
and rich hover — while explicitly forbidding a real 3D engine (three.js) in a hackathon
build unless approved.

Recharts is convenient but fights this kind of treatment: it owns the SVG structure, so
injecting per-segment gradients, top-cap / side-sliver extrusion polygons, an SVG
`feDropShadow`, a `perspective(...) rotateX(...)` tilt, and per-slice radial hover pops
means working against its renderer and coordinate math (the tilt in particular breaks
Recharts' tooltip positioning).

## Decision

- **Cost Trend bars** and **Gas Hotspots donut** are now bespoke SVG components
  (`components/cost-guard/CostTrendBars.tsx`, `GasHotspotsDonut.tsx`) where we control
  gradients, filters, transforms, and Framer Motion directly.
  - Bars: gradient front face + lighter top cap + darker right sliver fake the extrusion;
    grow-up `scaleY` stagger on view; hover lift+brighten with an HTML tooltip positioned
    on the untilted layer.
  - Donut: annular-sector paths with per-slice green→teal→info gradients; the **wrapper
    div** carries the `perspective(900px) rotateX(7deg)` tilt so the centre label and
    hover math stay on a flat layer; clockwise draw-in stagger; hover pops each slice along
    a precomputed radial vector; centre count-up cross-fades to the hovered slice.
- **KPI sparklines stay on Recharts** (`AreaChart`) — small, no extrusion needed — now with
  a gradient area-fill and a 900ms draw-in.
- Depth shadows use a theme-specific `--chart-shadow` token (lighter on Marble, deeper on
  Obsidian) fed into `feDropShadow`, with `overflow: visible` so shadows never clip.
- **No three.js.** The 2.5D illusion is layered SVG + gradients + CSS transforms only; this
  was the [ESCALATE] item and we deliberately stayed within the no-3D-engine constraint.

## Consequences

- Full visual control and no fight with Recharts' renderer for the two hero charts; the
  trade-off is we now own their layout/scale math and a11y labels (handled with `role="img"`
  + `aria-label`, sample-labeled, percentages normalised so they sum to 100, no NaN).
- Recharts remains a dependency for sparklines; if we later drop it, only the KPI cards need
  rework.
- All chart motion is gated behind `prefers-reduced-motion` (Framer `useReducedMotion`).
