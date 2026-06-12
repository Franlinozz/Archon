# Archon

Archon is a Mantle-native, ERC-8004 trustless smart-contract auditor. It ingests verified or pasted Solidity, runs a seven-stage read-only analysis pipeline, generates audit reports and Foundry regression tests, then lets a user explicitly log a proof of the report to Mantle Mainnet through ERC-8004 Reputation.

Live app: https://archonaudit.xyz · Docs: https://archonaudit.xyz/docs

Public verified report example: https://archonaudit.xyz/r/5ec46389-918a-4c90-858a-c14da0667a46

![Archon system architecture](docs/archon-architecture.svg)

## Why Archon exists

Smart-contract audits are usually static PDFs or private dashboards. Archon turns an audit into a verifiable object:

- a deterministic report hash,
- IPFS metadata,
- an ERC-8004 Reputation entry on Mantle Mainnet,
- a public report viewer that anyone can re-check,
- generated tests that developers can copy into a Foundry suite.

The core thesis is simple: trust the reproducible evidence, not only the auditor's claim.

## Product surface

- **Landing page** — concise public positioning and demo path.
- **Audit Studio** — paste Solidity or scan a verified Mantle address.
- **Seven-stage scan pipeline** — code parse, static analysis, Mantle context, protocol rules, AI enrichment, test generation, report assembly.
- **Report pages** — risk score, findings, line-level evidence, recommended fixes, generated tests.
- **Findings Index** — cross-report triage queue for all findings.
- **Public Report Viewer** — `/r/[reportId]`, no app shell or wallet required.
- **Proofs dashboard** — proof status, hash match, Mantlescan and IPFS references.
- **Contract Context Explorer** — read-only Mantle context view.
- **Cost Guard** — advisory/sample-labeled cloud cost posture screen.
- **Archon Assistant** — explains findings and recommendations; it never starts scans, connects wallets, or sends transactions.
- **Validation Preview** — read-only future challenge-flow explainer while official ERC-8004 Validation config is unavailable.

## CLI — `archon-scan`

Audits and gas reports from any terminal or CI, via the same public API as the app (zero dependencies, Node ≥ 18):

```bash
npx --yes github:Franlinozz/archon-cli scan contracts/Vault.sol --gas --fail-on high
```

Streams stage progress, prints the findings table and the receipt-calibrated L2/DA gas split, and exits `2` when the `--fail-on` severity gate is breached — CI-composable beyond the GitHub Action. Source lives in [`packages/cli`](packages/cli) (mirrored to [Franlinozz/archon-cli](https://github.com/Franlinozz/archon-cli) for npx); full docs at [/docs/platform-api/cli](https://archonaudit.xyz/docs/platform-api/cli).

## Architecture

Archon is intentionally simple and cost-controlled:

- **Next.js 15 App Router** for UI, API routes, SSR, and public report pages.
- **PM2 + Caddy on one VM** for the web process and scan worker.
- **BullMQ + local Redis** for scan jobs, live scan events, and cache.
- **Supabase Postgres** for scans, findings, reports, proofs, and AI cache rows.
- **Slither + solc/solcjs** for deterministic static analysis.
- **OpenAI gpt-4o-mini** for optional enrichment when `OPENAI_API_KEY` is present; deterministic fallback keeps the app usable without it.
- **Pinata/IPFS** for proof metadata.
- **Mantle Mainnet + ERC-8004** for Identity and Reputation proof records.

The scan pipeline is read-only. The only intended transaction path is the explicit user-approved proof log, guarded by simulation and cost checks.

## Archon-deployed contract (Mantle Mainnet, chain `5000`)

Archon ships its **own** on-chain proof contract — the primary, award-eligible anchor. Its
`logAuditProof()` publishes the AI inference result on-chain (deterministic report hash +
IPFS metadata URI + AI-derived risk score). It is permissionless and idempotent per report
hash, so both the gasless (server) and self-custody (user) proof paths work without the
ERC-8004 self-feedback restriction.

- ArchonProofRegistry: `0xe7043e2ec95eF357FbBa3359BA2f1edb10cEAD2a` — **Verified** on MantleScan
- Deploy tx: `0xb9ce87de86b212b91eb64012bbdab91014373da1f6d960470b340e1991a1a7c5`
- Example AI-proof tx (`logAuditProof`): `0x82d99588e5f1bff33d618743025d598445493032637de25844a67aa8e88088ef`
- Verified source: https://mantlescan.xyz/address/0xe7043e2ec95eF357FbBa3359BA2f1edb10cEAD2a#code
- Source + tests: `contracts/src/ArchonProofRegistry.sol`, `contracts/test/` (`forge test`, solc 0.8.24)

## ERC-8004 / Mantle configuration

Archon uses official ERC-8004 contract ABIs and the official Mantle Mainnet Identity and Reputation registries. Validation Registry support is intentionally disabled until an official Mantle Mainnet Validation Registry address is published.

Current production identity and registries (Mantle Mainnet, chain `5000`):

- Identity Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Reputation Registry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
- Archon Agent ID: `97`
- Agent identity reference: `eip155:5000:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:97`
- Agent file: https://archonaudit.xyz/.well-known/archon-agent.json
- Example proof tx: `0xfe5a2b6bc9e311227ea54eaad2fc2ce46a32bdea2ff7808528108d61569099cb`

## Safety invariants

- Blockchain writes only happen on Mantle Mainnet.
- Proof logging is explicit and user-approved.
- Static call/simulation happens before on-chain proof writes.
- Any unexpectedly high gas estimate should stop and ask for human confirmation.
- Validation challenge writes remain disabled without official registry config.
- Secrets stay in environment variables and are not committed.
- AI output is advisory and validated before storage/display where structured data is expected.
- Reports are risk intelligence, not guarantees or certifications.

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm dev
```

Required local services for the full app:

- Postgres-compatible `DATABASE_URL`
- Redis `REDIS_URL`
- Mantle RPC URL

Optional services:

- `OPENAI_API_KEY` for live AI enrichment/chat responses
- `IPFS_PIN_TOKEN` + `IPFS_PIN_PROVIDER=pinata` for proof metadata pinning
- proof wallet private keys only for controlled scripts / server-side proof operations

## Verification commands

```bash
pnpm typecheck
pnpm lint
pnpm scope-grep
pnpm secret-scan
pnpm test
pnpm build
```

`pnpm test` currently verifies deterministic proof hashing and Mantle rule fixtures.

## Demo script

1. Open https://archonaudit.xyz and click **Start Audit**.
2. Scan a Solidity sample or review the existing VaultV2 report.
3. Walk through the seven-stage scan pipeline and finding evidence.
4. Open generated tests and show a Foundry regression test.
5. Open Proofs and show hash match, IPFS metadata, and Mantlescan tx.
6. Share the public report URL and explain that anyone can verify it without connecting a wallet.
7. Close on the ERC-8004 thesis: Archon turns audit work into a portable on-chain reputation trail.

## Repository map

```text
app/                    Next.js app routes and API routes
app/app/                authenticated/workspace-style product pages
app/r/[reportId]/       public read-only report viewer
components/archon/      shared UI components and state surfaces
contracts/              sample Solidity inputs and rule fixtures
docs/                   architecture, ADRs, submission evidence
lib/ai/                 AI enrichment and fallback behavior
lib/chain/              Mantle, wagmi, ERC-8004 helpers
lib/proof/              canonical hash, metadata, IPFS, Reputation helpers
lib/scan/               seven-stage scanner and deterministic rules
lib/tests/              generated Foundry test builder
worker/                 BullMQ scan worker entrypoint
```

## License

MIT — see [LICENSE](LICENSE).
