# DoraHacks "Details" refresh — 2026-06-12

Paste-ready blocks for the submission page. Keep the existing **deployment-award block unchanged**; add/replace the sections below. Every claim here is live and linkable — nothing is aspirational except where explicitly labeled.

---

## Gas Optimizer — the insight no oracle will tell you

Mantle's legacy `GasPriceOracle.getL1Fee` overstates real data-availability cost by **~99.96%**: on live Mantle Mainnet transactions, the oracle quoted DA fees ~2,200–2,900× the `l1Fee` actually charged on the receipt (measured 99.9551% and 99.9656% divergence; methodology and tx hashes in [ADR 0007](https://github.com/Franlinozz/Archon/blob/main/docs/decisions/0007-mantle-gas-oracle-verification.md)).

Archon therefore prices DA from **receipt ground truth**, not the oracle: a calibrated zero/nonzero-calldata-byte model validated against real transactions. Every gas report splits **L2 execution vs DA per call**, so builders optimize the slice that actually costs money — on Mantle, that's execution; DA is nearly free. The public [gas leaderboard](https://archonaudit.xyz/gas-leaderboard) ranks completed reports with stated traffic assumptions (sample rows explicitly labeled).

## Developer surface: CLI + CI Action + API

- **CLI** — `npx github:Franlinozz/archon-cli scan contracts/ --gas --fail-on high`: streams scan stages, prints the findings table and the L2/DA split, exits nonzero on the severity gate. Zero dependencies; works in any CI. [Docs](https://archonaudit.xyz/docs/platform-api/cli)
- **GitHub Action** — posts a real gas-diff PR comment (L2 + DA columns, per-optimization deltas, stated assumptions). **Live evidence:** [PR #1 — green run + gas comment](https://github.com/Franlinozz/archon-gas-action-demo/pull/1) · [PR #2 — red run on a reentrancy regression](https://github.com/Franlinozz/archon-gas-action-demo/pull/2) (both against the production API, kept open).
- **REST API** — OpenAPI 3.1 + [interactive reference](https://archonaudit.xyz/api-reference); the CLI, Action, and app all share it.

## Cloud provider layer (Tencent Cloud)

AI enrichment runs behind a single pluggable interface with three first-class adapters — **OpenAI** (serving today), **ELFA**, and **Tencent Cloud Hunyuan** (OpenAI-compatible endpoint) — selected by environment with a deterministic-template fallback; artifact storage likewise has a **Tencent COS** backup adapter beside IPFS. Honest status: the Tencent adapters are fully built and ship inert pending the hackathon's Phase II computing credits; the moment a key lands, enrichment runs on Tencent Cloud with no code change. Configuration status is publicly inspectable at [`/api/providers`](https://archonaudit.xyz/api/providers) and documented under [Cloud providers](https://archonaudit.xyz/docs/platform-api/cloud-providers) — Archon never presents an inert provider as live.

## Business model

[Pricing](https://archonaudit.xyz/pricing): public proof verification is free forever; **Pro** prices depth (deep scans, receipt-calibrated gas evidence, anchored proofs); **CI + API** is metered. All tiers are free during the hackathon period — the page exists to show the revenue logic, not to charge anyone this week.

## Whitepaper

Full architecture, threat model, gas-evidence taxonomy (measured / estimated / unpriced), and proof design: [archonaudit.xyz/docs/resources/whitepaper](https://archonaudit.xyz/docs/resources/whitepaper) ([PDF](https://archonaudit.xyz/docs/archon-whitepaper.pdf)).

---

### Founder checklist (not part of the submission text)

1. **Today:** apply for the hackathon's Phase II Computing Credit pool (Tencent Cloud) on the event page — free, and it activates the Hunyuan/COS adapters for real.
2. Paste the blocks above into DoraHacks Details, keeping the deployment-award block intact.
3. Leave demo PRs #1/#2 open — they are the living green/red evidence.
