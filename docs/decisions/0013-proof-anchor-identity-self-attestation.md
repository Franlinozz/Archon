# ADR 0013: Proof anchoring moves from Reputation feedback to Identity self-attestation

Status: accepted
Date: 2026-06-02

## Context

Proof logging called ERC-8004 **Reputation `giveFeedback(agentId=97, …, feedbackHash)`**.
That registry forbids self-feedback (`require` revert `Self-feedback not allowed`): an
address cannot post feedback about an agent it owns. MantleScan tx `0x375d7c…ee983c`
confirmed the revert.

Diagnosis (read-only, on-chain):
- Agent 97 `ownerOf` == `getAgentWallet` == `0xBd88…5E70` (the funded/demo wallet).
- **Self-custody** signs with the user's wallet; the demo operator connects the
  owner wallet → `giveFeedback` on its own agent → reverts. Confirmed.
- **Gasless** uses a *distinct* non-owner client (`0x53173…90Fa6`) so `giveFeedback` is
  permitted — that's how VaultV2's feedbackIndex 1&2 were logged — but that client
  wallet is nearly empty (~0.0003 MNT) and there was no pre-flight simulation or
  receipt timeout, so it stalled on "Anchoring…".

## Decision (Option A, human-approved)

A report proof is **self-attestation**, so anchor it on the **Identity Registry** via
`setMetadata(agentId, "archon.report.<reportId>", bytes{reportHash, metadataUri})`. The
agent owner writing its own identity metadata is permitted (no self-feedback rule).
Verify by reading `getMetadata` / the `MetadataSet` event and matching the report hash.

- Both flows go through one builder (`lib/proof/identity.ts`):
  - **Gasless** → server signs with the **agent-owner wallet** (`ARCHON_WALLET_PRIVATE_KEY`,
    9.5 MNT) — not the near-empty reputation client.
  - **Self-custody** → the connected owner wallet signs `setMetadata`; the server verifies
    the receipt + `MetadataSet` + hash and records `loggedBy = user`.
- **Canonical report hash and registry addresses are unchanged** (the [ESCALATE]
  constraints). Only the on-chain write target/function and its verification changed.
- **Read-before-write duplicate guard** (`getMetadata`) → "already anchored".
- **Legibility (14.4):** `simulateContract` pre-flight (reverts surface before send),
  bounded receipt waits + client AbortController timeouts, decoded revert messages, and a
  modal phase machine (idle→simulating→awaiting/submitting→pending→confirmed|reverted|
  timeout) — the modal can no longer hang on "Anchoring…".

## Verification

Read-only `simulateContract` (no tx sent): owner → would **succeed**; non-owner → reverts
(auth holds). typecheck + lint + build green. A live mainnet write happens only when a
human clicks Anchor; the existing VaultV2 Reputation proof still verifies via its stored
record (hash match + tx present), so older proofs are unaffected.
