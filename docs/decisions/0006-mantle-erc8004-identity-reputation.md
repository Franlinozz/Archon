# ADR 0006: Mantle ERC-8004 Identity + Reputation scope

## Status
Accepted

## Context
Francis confirmed the Mantle Mainnet ERC-8004 registry addresses against the official ERC-8004 team repository (`github.com/erc-8004/erc-8004-contracts`). That README publishes Mantle Mainnet addresses for IdentityRegistry and ReputationRegistry only. It does not publish a Mantle Mainnet ValidationRegistry address, and the ERC-8004 docs describe Validation as still under active revision.

Archon also needs public Mantle RPC access and free-tier IPFS pinning for proof metadata. Secrets must remain server-side and out of git. Francis provided a Pinata JWT for the VPS runtime, so production proof metadata can use real `ipfs://` URIs instead of the HTTPS fallback.

## Decision
- Use Mantle Mainnet public RPC: `https://rpc.mantle.xyz`.
- Use official ERC-8004 Mantle Mainnet registries:
  - IdentityRegistry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
  - ReputationRegistry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
- Scope Session 5 to Identity + Reputation only.
- Keep `ERC8004_VALIDATION_REGISTRY` unset. Validation/challenge UI must degrade gracefully and avoid disabled or nonfunctional affordances.
- Use ABIs copied directly from the official repo `abis/` folder; do not hand-write ABI fragments.
- Use free-tier Pinata IPFS pinning via `IPFS_PIN_PROVIDER=pinata` and server-only `IPFS_PIN_TOKEN` for production proof metadata. If no token is configured, Archon stores canonical metadata in Postgres and returns an HTTPS metadata endpoint (`/api/reports/[id]/proof/metadata`) so verification remains deterministic without bloating on-chain calldata.

## Consequences
- Archon can prepare and simulate identity minting without a Validation Registry.
- Any Validation Registry/challenge feature remains Phase 5/stretch until an official Mantle Mainnet address is published.
- `ARCHON_WALLET_PRIVATE_KEY` is required only for the actual mint/send step and must be placed directly into VPS `.env.local` by Francis, never sent in chat.
- ERC-8004 Reputation `giveFeedback` rejects self-feedback from the agent owner/operator. Archon therefore uses a dedicated non-owner client wallet (`ARCHON_REPUTATION_CLIENT_PRIVATE_KEY`) funded with a tiny MNT balance solely for Reputation proof entries.
