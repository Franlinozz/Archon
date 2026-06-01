# ADR 0011: Brand assets, animated hero mark, logo-as-home-link

Status: accepted
Date: 2026-06-01

## Context

The founder uploaded real brand art to `public/` with space/comma/semicolon
filenames (URL-breaking). Session 9 wires these in (favicon, nav, hero), animates
the hero mark, and adds Chromium verification; Session 2b makes the logo a home link.

## Decisions

- **Renamed** the six assets to kebab-case: `mark-light/dark`, `logo-light/dark`,
  `hero-light/dark` (`git mv`, history preserved). Nothing references the old names.
- **Favicon** via `metadata.icons` with `prefers-color-scheme`: light tab →
  `favicon-light-32` (Marble mark), dark tab → `favicon-dark-32` (Obsidian mark) —
  the pairing with real contrast. 32px + apple-touch 180 + a 64px default generated
  with `sharp` (added as a devDependency).
- **OG/social** image uses `hero-dark.png`.
- **Hero mark**: the placeholder SVG "A" is replaced by the real `next/image` mark
  (theme-correct, `priority`, explicit 144×144 → no CLS), in a rounded tile with:
  entrance scale + brand ring draw, idle float + breathing glow + slow rotating
  outer ring, a periodic clipped scan-beam, and ≤8° pointer tilt (disabled on
  coarse pointers). `prefers-reduced-motion` → fully static.
- **Logo home link (2b)**: `ArchonLogo` is a `next/link` — public shells → `/`,
  app shell → `/app` (dashboard home), with a focus-visible ring, subtle hover
  brightness, and a context-correct `aria-label`. A flexible "Archon home" escape
  hatch was added to the workspace menu.

## Deviations from the addendum spec (recorded per the executor note)

- **Nav/sidebar uses the mark + "ARCHON" wordmark text, not `logo-light/dark`.**
  The provided "logo" PNGs are wide promotional banners (mark + wordmark + corner
  decorations + baked background, ~1672×941) — at ~30px nav height the actual logo
  would be tiny with large empty margins. The mark (square) + the existing wordmark
  text is a tighter, crisper, theme-aware lockup. The banner logos remain available
  (e.g. OG image).
- **Verification harness lives at `/root/.pwverify/verify-hero.cjs`** (shared
  chromium install, alongside the existing `verify.cjs`/`wsmenu.cjs`/`palette.cjs`)
  rather than adding Playwright to the app's dependencies. `scripts/verify-hero.mjs`
  is the identical in-repo record. It ran against a production `next start` on a
  test port (3100) before going live — 11/11, with the 4 review screenshots
  (Marble/Obsidian × 1440/390) inspected.
- Favicon scheme mapping follows the asset-table semantics (mark-light for light
  contexts), not the inverted parenthetical in 9.2 — chosen by what actually has
  contrast.

## Consequences

No CLS (explicit image dims), no `%20`/404s (kebab names), theme-correct with no
flash (CSS `.theme-*` visibility swap). `sharp` is a build-only devDependency.
