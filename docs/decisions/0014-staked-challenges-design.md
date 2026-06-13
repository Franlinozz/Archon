# ADR 0014 — Staked Challenges (design only; not deployed)

Status: **Design / proposed**. Founder-approved as a design exercise (F8). **Nothing in this document is deployed.** Any implementation requires a separate, explicit go-ahead and crosses the on-chain hard gate.

Date: 2026-06-13

## Context

Archon already ships a *public, free* challenge ledger: anyone can dispute a report or optimization, referencing its on-chain proof (`report_challenges`). That makes disputes visible but **costless** — there is no economic signal separating a serious, well-evidenced challenge from spam, and no reward for being right. Staked challenges close the trustless loop: put money behind a dispute, resolve it, and slash/reward accordingly. This is the natural complement to ArchonProofRegistry (anchored claims) — anchored *counter*-claims with skin in the game.

This is deliberately a design-only deliverable: it is **new contract surface, new economics, and new attack surface**, and the official ERC-8004 Validation Registry (the eventual canonical home for this) is not yet published on Mantle. Designing now, deploying later (if ever), is the honest posture.

## Mechanism (proposed)

1. **Anchor.** A report is anchored as today (`ArchonProofRegistry.logAuditProof(reportHash, …)`).
2. **Challenge.** A challenger calls `openChallenge(reportHash, claimHash)` with a **bond** (ERC-20, e.g. a stablecoin or MNT) locked in escrow. `claimHash` commits to off-chain evidence (IPFS) stating precisely what is disputed (a false positive, a missed finding, a wrong gas number) and the expected correct result.
3. **Challenge window.** A fixed window (e.g. 7 days) during which the report author (or anyone) may **respond** by staking a matching counter-bond and submitting rebuttal evidence.
4. **Resolution.** A resolver (see *Resolution authority*) issues a verdict: `upheld` (challenge correct) or `rejected`. Resolution references both evidence hashes.
5. **Settlement.**
   - Challenge **upheld** → challenger reclaims their bond **plus** the author's counter-bond (minus a protocol fee); the report is marked `disputed` on-chain.
   - Challenge **rejected** → the author reclaims their counter-bond plus the challenger's bond (minus fee).
   - **No response** from the author within the window → challenge auto-`upheld` (the report is marked `disputed`, challenger refunded; no counter-bond existed to award). Author silence cannot win.
6. **Record.** The outcome is itself anchorable, so a contract's address page (F7) shows `audited → challenged → resolved` alongside `audited → drifted → re-audited` (F1).

Bonds are denominated in a single configured asset; minimum bond is a governance parameter sized to exceed expected resolution/gas cost so frivolous challenges are net-negative EV.

## Griefing & attack analysis

- **Spam challenges (grief the author).** Bond minimum + loser-pays makes losing challenges costly; the author only ever stakes when they choose to contest, and silence does not forfeit a counter-bond they never posted. Net: spam is bounded by the spammer's losses.
- **Grief-by-silence (author ignores valid challenges).** Auto-uphold on no-response means ignoring a challenge marks the report `disputed` — the author's reputation (ERC-8004) is the thing at risk, so silence is not a winning strategy.
- **Resolver capture / bias.** The single biggest risk. Mitigations: resolution evidence is public and hash-committed; resolver decisions are themselves anchored and challengeable at a higher tier; long-term, resolution moves to the ERC-8004 Validation Registry or a panel, not a single key.
- **Bribery / collusion (author bribes resolver).** Mitigated by public evidence + appeal tier + eventual decentralized validation; until then, the resolver is Archon's known agent key and decisions are auditable — trust is explicit, not hidden.
- **Sybil challenges.** Each challenge is independently bonded; sybils gain nothing without capital at risk per challenge.
- **Front-running settlement.** Settlement is deterministic from on-chain state; there is no MEV in claiming one's own escrow.
- **Round-tripping / wash disputes (author challenges self to fake activity).** Discouraged by the protocol fee (both sides lose a cut on every resolution) and by the fact that a self-`disputed` report damages the author's own reputation.

## Resolution authority (staged)

1. **Phase A (if ever built first):** Archon's agent key (#97) as the resolver, decisions public + anchored + appeal-able. Honest, centralized, explicitly trust-based — same posture as today's gasless proof path.
2. **Phase B:** a small permissioned panel (multi-sig of reputable Mantle security parties) for resolution and appeals.
3. **Phase C (end state):** the **official ERC-8004 Validation Registry** on Mantle once published — staked challenges become validation requests/responses in the standard, and Archon stops being the resolver of record. Archon's `validationRegistryStatus()` already tracks that this address is intentionally unconfigured until official.

## Why not now

- **On-chain hard gate.** New escrow + slashing contracts are exactly the surface the autonomy charter forbids deploying without explicit approval.
- **Economics need real parameters.** Bond size, fee, window length, and asset choice should be set against observed challenge volume and Mantle gas — data Archon will have more of after F7 drives address traffic.
- **Validation Registry alignment.** Building bespoke resolution now risks diverging from the ERC-8004 standard; waiting lets the canonical interface shape the contract.

## If approved to build

Deliverables, in order, each separately gated:
1. Threat-model review + parameter proposal (bond/fee/window) with EV tables.
2. `ArchonChallengeEscrow` contract (Foundry) + full test suite incl. griefing scenarios; testnet only.
3. Resolver tooling (Phase A) with public evidence pinning + anchored verdicts.
4. UI: staked-challenge flow on the report + address pages; outcomes in the F7 timeline.
5. Mainnet deploy **only** with explicit founder approval and an external review of the contract.

No code, no contract, and no economics are committed by this document.
