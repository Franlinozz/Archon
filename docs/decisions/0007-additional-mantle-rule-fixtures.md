# ADR 0007: Additional Mantle Rule Fixtures

## Status
Accepted

## Context
Session 8 stretch work needs a small, high-signal expansion of Archon's deterministic rule engine without making the scanner noisy or adding unsafe blockchain behavior.

## Decision
Add two deterministic Mantle-aware rules backed by local Solidity fixtures:

1. `mantle-origin-auth` — flags `tx.origin` authorization because it can be phished through intermediary contracts and breaks wallet/router/account-abstraction composability.
2. `mantle-timestamp-assumption` — flags deadline/settlement logic that depends on `block.timestamp` without an explicit tolerance, grace, or sequencer policy.

Both rules are read-only static checks. They only emit findings during the Protocol Rule Engine stage and never trigger transactions.

## Verification
`pnpm test` runs:

- `scripts/test-proof-hash.ts`
- `scripts/test-mantle-rules.ts`

The rule test loads fixtures from `contracts/fixtures/` and asserts the expected categories are emitted.

## Consequences
The rule engine gains more Mantle-specific coverage while staying explainable and cheap. False positives are possible, so findings are labelled with confidence and recommended engineering review rather than framed as proof of exploitability.
