# Whitepaper change log

The PDF is the citable edition and is versioned — never silently edited. Claim-level changes between versions are noted here; the docs Whitepaper page (HTML edition) tracks the current PDF.

## v2.1 — 2026-06-14 (`archon-whitepaper-v2.1.pdf`)

- Folds the post-v2.0 deliveries into the citable edition: **Sentinel**, **verified-build attestations**, the **Gas Observatory**, the **agent trust API + MCP server**, **address pages + badges**, the **GitHub App**, and the **VS Code extension** move from roadmap ("Next"/"Later") to **Now (live)** in §10; §08 now lists the full platform surface.
- §04 reflects the hardened AI-enrichment bound: per-call timeout 45s → 75s with a single transient (429/5xx) retry and per-finding schema validation; the report logs the exact fallback cause per batch. No detection-claim changes — detection remains deterministic-first.
- Staked challenges stay explicitly design-only (ADR 0014, nothing deployed); webhooks stay planned. Served at `/whitepaper.pdf`; the docs Whitepaper page is the aligned HTML edition.

## v2.0 — 2026-06-12 (`archon-whitepaper-v2.pdf`)

- Full rewrite around the "verifiable DevTools" thesis: four commitments, seven-layer architecture (Figure 2), three artifact types.
- Gas section now leads with receipt calibration and Table 1 (legacy `getL1Fee` under-reports Mantle's charged `l1Fee` by 99.955% / 99.966% on live transactions; ADR 0007).
- Evidence taxonomy formalized: measured / estimated (calibrated, labeled) / unpriced.
- Supersedes the v1 generated PDF (`/docs/archon-whitepaper.pdf`, kept online for link compatibility).

### Post-v2.0 deliveries (no claim changes; roadmap items shipped)

- 2026-06-12 — Sentinel (roadmap "Next" item: continuous monitoring of deployed contracts with drift alerts) shipped; documented at `/docs/audit/sentinel`.
- 2026-06-12 — Verified build attestations (roadmap "Later" item: source-to-bytecode matching, extends §06) shipped; documented at `/docs/on-chain-proofs/verified-builds`.
- 2026-06-13 — Mantle Gas Observatory (extends §05: the receipt-calibration story becomes a live public dashboard + oracle-vs-receipt tracker) shipped at `/observatory`.
- 2026-06-13 — Agent Trust API + MCP server (extends §08/§10: agents consume verifiable security work via a signed verdict + MCP tools) shipped at `/docs/platform-api/for-agents`.
- 2026-06-13 — Address intelligence pages + badges (extends §08: every Mantle contract gets a permanent public security URL + README badge) shipped at `/address/<address>`.
- 2026-06-13 — Staked challenges DESIGN (ADR 0014, extends §06/§07 + roadmap "Later"; design-only, nothing deployed).

## v1 — 2026-06-08 (generated `archon-whitepaper.pdf`)

- Initial public edition, generated from the docs page via pdfkit.
