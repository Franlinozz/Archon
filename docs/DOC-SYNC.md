# DOC-SYNC — the standing end-of-session ritual

Run this checklist at the end of **every** feature session, before the final commit. It is how the README, architecture diagram, docs, whitepaper, and landing page stay true as the product grows. A feature is not shipped until its documentation surfaces agree with it.

## Checklist

1. **README** — feature matrix row + live-links block updated? New badges/links 200?
2. **Architecture diagram** — if a layer changed, regenerate `docs/assets/archon-architecture.svg` (generated as code, brand `#16A06B`, mirrors whitepaper Figure 2) and copy to `public/docs/archon-architecture.svg`.
3. **Docs** — a section/page for the feature exists under `content/docs/` and is linked from `lib/docs/nav.ts`.
4. **Changelog** — entry added to `content/docs/resources/changelog.mdx`.
5. **Landing** — if a public surface was added, it is reachable from the footer (`components/marketing/SiteFooter.tsx`); no dead controls.
6. **Whitepaper** — if a claim changed, add a note to `docs/whitepaper/CHANGES.md`. The PDF is **versioned, never silently edited**; the docs Whitepaper page (HTML edition) must keep the same claims and labels as the current PDF.
7. **Truthfulness sweep** — new copy presents nothing inert as live, nothing estimated as measured, nothing sample as production. Check the exact direction and magnitude of any quantitative claim against its primary source (ADR / receipt / DB), not from memory.
8. **Gates** — `pnpm test · secret-scan · typecheck · lint · build`; CI green after push; live smoke of touched surfaces.
9. **Mirrors** — if `packages/cli` changed, re-copy `bin/ + package.json + README.md` to the `Franlinozz/archon-cli` repo and push.

## Why item 7 exists

On 2026-06-12 a session shipped the oracle-divergence story with the direction inverted ("oracle overstates DA" instead of the correct "oracle **under-reports** charged DA by ~99.96%") and presented a savings split as a fee split. Both surfaced from paraphrasing instead of re-reading ADR 0007. Verify claims at the source, every time.
