# Whitepaper change log

The PDF is the citable edition and is versioned — never silently edited. Claim-level changes between versions are noted here; the docs Whitepaper page (HTML edition) tracks the current PDF.

## v2.0 — 2026-06-12 (`archon-whitepaper-v2.pdf`)

- Full rewrite around the "verifiable DevTools" thesis: four commitments, seven-layer architecture (Figure 2), three artifact types.
- Gas section now leads with receipt calibration and Table 1 (legacy `getL1Fee` under-reports Mantle's charged `l1Fee` by 99.955% / 99.966% on live transactions; ADR 0007).
- Evidence taxonomy formalized: measured / estimated (calibrated, labeled) / unpriced.
- Supersedes the v1 generated PDF (`/docs/archon-whitepaper.pdf`, kept online for link compatibility).

## v1 — 2026-06-08 (generated `archon-whitepaper.pdf`)

- Initial public edition, generated from the docs page via pdfkit.
