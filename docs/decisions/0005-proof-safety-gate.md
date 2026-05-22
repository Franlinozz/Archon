# ADR 0005: ERC-8004 proof writes require verified live registry config

## Status
Accepted

## Context
Session 5 introduces wallet connection, deterministic report proofs, and the on-chain proof surface. The build plan explicitly says to escalate if live ERC-8004 contract addresses or ABIs on Mantle Mainnet cannot be verified. Appendix B currently contains placeholder registry addresses.

## Decision
Archon may prepare deterministic proof metadata and store idempotent prepared proof rows, but it must not mint Archon's ERC-8004 identity or send/log report proofs until the live Mantle Mainnet ERC-8004 registry addresses, ABIs, mint cost, permission model, and gas estimate are confirmed by Francis.

The Generate Proof modal remains active for review and network-guard validation, but `Sign & Log Proof` stays disabled unless verified ERC-8004 config exists and a static-call/simulation path is available.

## Consequences
- No guessed ERC-8004 ABI is committed as a write artifact.
- The project wallet private key remains server-side only and unused.
- Prepared proofs are keyed by `report_hash` and include raw metadata in Postgres so verification does not depend on an IPFS gateway.
- Completing the final on-chain Done Gate requires the verified addresses/ABIs and explicit approval for the write.
