# ADR 0010: Wallet purpose — SIWE login + dual proof-logging modes

Status: accepted
Date: 2026-06-01

## Context

The connected wallet did nothing functional: the server-side client wallet anchored
every proof, so users had no concrete reason to connect, and "Connect Wallet" implied a
cost it never incurred. We want the wallet to mean something honestly, without weakening
the gasless demo or touching the proof-registry contract / canonical-hash logic.

## Decision

1. **SIWE login (gasless).** On connect (on Mantle), the wallet signs an EIP-4361 message
   stating plainly it is "a free signature and does not authorize any transaction or spend."
   A one-time Redis nonce + viem `recoverMessageAddress` verify it server-side, opening an
   HMAC-signed httpOnly session cookie (`lib/auth/session.ts`, `SESSION_SECRET`). The session
   is the only thing that gates proof logging — never a per-proof transaction signature.
2. **Network guard.** Wrong-network wallets get a working "Switch to Mantle" action; correct
   ones show the green Mantle · 5000 badge. This is a real reason to connect even for users
   who never log a proof themselves.
3. **Two proof modes** on the Generate Proof modal:
   - *Archon logs it for me* (default, gasless): unchanged server-pay path
     (`logPreparedProofOnReputation`), `loggedBy` = Archon's agent client wallet.
   - *I log it from my wallet* (self-custody, ~small MNT gas): the user's wallet submits the
     **same** `giveFeedback` call with identical args (sourced from the new shared
     `giveFeedbackParams`), then `verifyAndRecordUserProof` confirms the `NewFeedback` event's
     `feedbackHash` equals our computed `reportHash` (the same verification as today) and
     records `loggedBy` = the user's address. A user is a legitimate third-party feedbacker
     under ERC-8004, so this needs no contract change.

## Deviations from the addendum spec

- The spec's bug-table assumed a `registerReport()` / `ReportRegistered` event. Archon's
  actual on-chain anchor is ERC-8004 Reputation `giveFeedback` → `NewFeedback`; the
  self-custody path mirrors that exact call/event instead. Verification still matches the
  emitted hash against the computed report hash.
- SIWE verify is hand-rolled (per the spec's allowance) rather than pulling the `siwe`
  package, to avoid an extra dependency.

## Consequences

- Server-pay stays fully gasless; the only new requirement is a free SIWE signature to
  establish a session before logging (either mode). Disconnect clears the session.
- Untestable in this environment: the real wallet UX (MetaMask sign) and the self-custody
  mainnet transaction (needs a funded user wallet) — built and type/route-verified, plus the
  full server SIWE path is covered by `scripts/test-siwe.ts` with a synthetic signer.
- No change to the proof-registry contract, canonical hash, or the read-only scan pipeline.
