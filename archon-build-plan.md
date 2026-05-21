# Archon — Build Plan & Engineering Handbook

*Version 2.0 · Fresh regeneration · Dark "Obsidian" design system*
*Audience: Codex 5.5 (primary executor), Claude Code (surgical edits), Opus 4.7 (planning / debugging / review)*

---

> **Project.** Archon — the first ERC-8004 trustless smart-contract auditor agent native to Mantle Mainnet. Built for the Turing Test Hackathon 2026, AI DevTools track.
>
> **North star.** Win on the *idea* — a trustless audit agent with a portable on-chain identity and reputation — not on feature surface area. A judge should understand the category in ten seconds and trust it in sixty.
>
> **Target.** A stable, demoable product in ~3 weeks. Submission-ready, not feature-complete.
>
> **Budget ceiling.** ~$50-200 out of pocket. ~$20 in MNT for gas, ~$10 in OpenAI credit, one Google Cloud VM you already pay for, free tiers for everything else. **Read Appendix E (Cost Discipline) before provisioning anything.** The Xyndicate/Vercel incident does not repeat.
>
> **Executor model.** Codex 5.5 builds. Claude Code does high-context surgical edits. Opus 4.7 plans, debugs, and reviews. This document is the contract between all three.

---

## Changelog from v1.0

This is a clean regeneration, not a patch. Three things changed:

1. **Design system flipped from light to dark.** v1.0 (and the original Archon UI guide PDF) specified a light theme - white/mint/icy-blue surfaces, teal primary. **v2.0 overrides that.** Archon is now dark-first: a near-black canvas with a vivid signal-green accent, heavy grotesk display type, and monospace terminal panels. This is a deliberate decision driven by the reference UI the founder approved (the dark "operator console" aesthetic). Dark mode reads as a *serious security tool*; it also differentiates Archon from the pastel SaaS look every other AI-audit submission will ship. The full token set is Section 5. Every page prompt below assumes dark.
2. **The phase pack is consolidated into one document.** v1.0 split prompts across artifacts. v2.0 is a single handbook so the executor can grep, scroll, and cross-reference without context loss.
3. **ERC-8004 moved from "stretch" to Phase 3 core.** It is the thesis. It is not optional. See Section 2.

Everything else from v1.0 - the architecture, the 7-stage pipeline, the protocol registry, the read-only safety rule, the Greek "overseer" brand - carries forward unchanged.

---

## How to read this document

This is not a recipe. It is a **flight plan with three control levels**. Every implementation instruction below is governed by one of them:

- **[LOCKED]** - Strategic constraints the executor MUST NOT change without explicit human approval. These are the things that, if altered, break the product's reason to exist or its budget. If a LOCKED item seems wrong, **stop and escalate** - do not "fix" it.
- **[FLEXIBLE]** - Implementation details where the executor exercises judgment. Pick the cleanest path. Document the choice in `docs/decisions/NNNN-short-title.md` (one short ADR per non-trivial decision) so review can follow your reasoning.
- **[ESCALATE]** - Situations where the executor must stop and ask the human before proceeding. Getting these wrong costs more than the hour spent waiting.

Priority when two collide: **LOCKED > ESCALATE > FLEXIBLE.**

**On partnership.** The executor is a partner, not a typist. If a LOCKED approach genuinely will not work - a library is abandoned, an API changed, a version conflict is unresolvable - you are expected to find the nearest equivalent that preserves the *intent*, implement it, and record the deviation in an ADR plus a line in `docs/DEVIATIONS.md`. The rule is simple: **you may change the how, never the why.** When unsure which one you are touching, escalate.

**Phases are sequential.** Do not begin Phase N+1 until Phase N's acceptance criteria are green. Each phase ends with a runnable, demoable increment. Phase 5 (stretch) only runs if Phase 4 is fully stable.

---

# PART I - PRODUCT & ARCHITECTURE LOCK

Part I is almost entirely [LOCKED]. It is the spec the phase prompts implement. Read it once, fully, before touching Phase 0.

## 1. What Archon is

**One sentence.** Archon is an AI-powered safety layer for Mantle Mainnet builders - it audits smart contracts, detects Mantle-specific protocol risk, generates Foundry tests, flags runaway gas/infra cost, and anchors every report as a verifiable proof on-chain.

**The category sentence (this is the one judges hear).** Archon is not an AI audit tool. Archon is *the first ERC-8004 trustless auditor agent native to Mantle Mainnet* - an agent with its own on-chain identity, whose every audit is hash-anchored and posted as a public, challengeable reputation signal.

The difference between those two sentences is the difference between polite applause and a prize. Section 2 explains why.

**What Archon does, concretely:**

- Ingests a Solidity contract (pasted source or a deployed Mantle address) read-only - code, ABI, bytecode, events, balances, dependencies, known protocol interactions - with **no transaction required**.
- Runs a deterministic static-analysis pass (Slither) plus a Mantle-aware rule engine, then layers an AI reasoning pass on top for impact, exploit scenario, and recommended fix.
- Produces a structured audit report: risk score, severity distribution, per-finding detail with line-level traceability and a suggested patch diff.
- Generates Foundry tests tailored to the findings, including Mantle-fork test scaffolding.
- Surfaces cost intelligence - gas hotspots, RPC waste, redundant deploys, runaway-cost patterns.
- On explicit user approval, logs a cryptographic proof of the report on Mantle Mainnet and posts it through the ERC-8004 registries, so the audit (and Archon's own track record) is independently verifiable forever.

**What Archon is NOT - and must never drift into:**

- [LOCKED] Not an RWA / yield / portfolio optimizer. Different track, different risk profile. Out of scope entirely.
- [LOCKED] Not an autonomous trader or fund mover. Scanning is read-only. The *only* mainnet transaction in the entire product is the user-approved proof-logging action.
- [LOCKED] Not a multi-chain scanner. Mantle specificity is the moat. No "select your chain" dropdown.
- [LOCKED] Not a guarantee. Language is always *risk intelligence*, *findings*, *confidence*, *recommended fix*, *verifiable proof* - never *safe*, *secure*, *guaranteed*, *certified*.

## 2. The thesis - why ERC-8004, and why it is not optional

Read the hackathon's own framing before writing a line of code. Mantle positioned the Turing Test Hackathon 2026 as the first time an on-chain environment is used to benchmark AI-agent performance at scale, with every key decision recorded permanently on Mantle. Participating agents receive an on-chain identity and accrue reputation. **The thesis is trustless agents with on-chain, portable reputation - not "an AI tool with a Mantle badge."**

ERC-8004 is already live on Mantle Mainnet (deployed Feb 2026 - months before this hackathon). It defines three registries:

| Registry | What it is | How Archon uses it |
|---|---|---|
| **Identity Registry** | An ERC-721 that issues a unique identity NFT to an agent. | Archon mints one identity NFT. That token *is* "Archon the auditor agent." |
| **Reputation Registry** | An append-only record of feedback / outcomes tied to an agent identity. | Every completed audit posts a reputation entry referencing the report hash. Archon's track record becomes public and portable. |
| **Validation Registry** | A mechanism for third parties to attest to or challenge an agent's claimed work. | A contract owner, an independent reviewer, or a judge can attest to or challenge any Archon finding on-chain. Audits are not "trust me" - they are contestable. |

**Why this is the whole game.** There are already 8+ funded teams doing AI smart-contract audit (Sherlock AI, Olympix, Almanax, Aderyn, Quantstamp's AI suite, Certora, and others). Pitching "we do AI audit, but for Mantle" to judges who have seen all of them is a loss. Archon does not compete on "better AI audit." It competes on **category**: an audit agent whose identity, reputation, and individual findings are all on-chain objects anyone can verify or challenge. That is the hackathon's literal thesis, executed.

[LOCKED] ERC-8004 integration ships in Phase 3. The product's positioning, landing page, and pitch all lead with it. An Archon that audits well but cannot prove its work on-chain has missed the point of the event.

[ESCALATE] if, during Phase 3, the live ERC-8004 contract addresses or ABIs on Mantle Mainnet differ materially from what Section 3 / Appendix B assume. Do not guess registry interfaces - confirm against the live deployment.

## 3. System architecture

Archon is a pipeline. Source and context flow left-to-right through seven layers; the UI is a window onto each layer.

```
                    +-----------------------------------------------------+
   contract  ------>|  1. STATIC ANALYZER                                 |
   source / address |     Slither + solc-select. Parses Solidity, emits   |
                    |     deterministic findings with file/line ranges.   |
                    +----------------------+------------------------------+
                                           v
                    +-----------------------------------------------------+
                    |  2. MANTLE CONTEXT LAYER                            |
                    |     Read-only RPC + explorer fetch: verified source,|
                    |     ABI, bytecode, events, balances, deploy meta.   |
                    +----------------------+------------------------------+
                                           v
                    +-----------------------------------------------------+
                    |  3. PROTOCOL REGISTRY                               |
                    |     Fingerprints against mETH, cmETH, USDY, Aave V3,|
                    |     Merchant Moe, Agni. Emits protocol-match cards. |
                    +----------------------+------------------------------+
                                           v
                    +-----------------------------------------------------+
                    |  4. RULE ENGINE                                     |
                    |     Deterministic Mantle-specific risk rules:       |
                    |     L1-data-fee assumptions, oracle heartbeat,      |
                    |     sequencer/precompile assumptions, slippage.     |
                    +----------------------+------------------------------+
                                           v
                    +-----------------------------------------------------+
                    |  5. AI REASONING ENGINE                             |
                    |     gpt-4o-mini enriches each finding: summary,     |
                    |     why-it-matters-on-Mantle, exploit scenario,     |
                    |     recommended fix, confidence. Batched + cached.  |
                    +----------------------+------------------------------+
                                           v
                    +-----------------------------------------------------+
                    |  6. REPORT / TEST BUILDER                           |
                    |     Assembles report, computes risk score, builds   |
                    |     severity distribution, generates Foundry tests. |
                    +----------------------+------------------------------+
                                           v
                    +-----------------------------------------------------+
                    |  7. MANTLE MAINNET PROOF LOGGER                      |
                    |     On user approval only: hash report, log proof,  |
                    |     post to ERC-8004 Identity/Reputation/Validation.|
                    +-----------------------------------------------------+
```

**Runtime topology.** [LOCKED] One Google Cloud VM does ~90% of the work. Do not spread this across managed services that bill per-invocation.

```
   +------------------- Google Cloud VM (single e2-standard-2 class) -------------------+
   |                                                                                   |
   |   Caddy (TLS, reverse proxy)                                                       |
   |        |                                                                          |
   |        +-->  Next.js app (App Router, SSR + API routes)  -- pm2: archon-web        |
   |        |                                                                          |
   |        +-->  Worker (BullMQ consumer, runs 7-stage pipeline) -- pm2: archon-worker |
   |                  |                                                                |
   |                  +--> Slither + solc-select (local binaries)                      |
   |                  +--> outbound: Mantle RPC, OpenAI, IPFS pinning                   |
   |                                                                                   |
   |   Redis (local, BullMQ queue + AI cache)  -- pm2 process or system service         |
   |                                                                                   |
   +-----------------------------------------------------------------------------------+
                  |                                            |
                  v                                            v
        Supabase (managed Postgres, free tier)        Mantle Mainnet (RPC + ERC-8004)
```

[FLEXIBLE]: nginx instead of Caddy; managed Redis (Upstash) instead of local Redis if the VM is memory-tight. Record the choice in an ADR. [LOCKED]: it stays one VM. No on-demand build farms, no per-request serverless for the worker. Appendix E explains why in blood.

## 4. The route map - 10 primary pages

| # | Route | Page | Primary job | Ships in |
|---|---|---|---|---|
| 01 | `/` | Landing / Marketing Home | Explain the product in 10s; funnel into a scan. | Phase 4 |
| 02 | `/app` | Workspace Overview | Command center: audits, scans, posture, quick actions. | Phase 4 |
| 03 | `/app/audit/new` | Audit Studio / New Scan | Start a read-only scan from code or contract address. | Phase 1 |
| 04 | `/app/context` | Contract Context Explorer | Inspect a deployed Mantle contract. | Phase 4 |
| 05 | `/app/scans/[scanId]` | Live Scan Progress | The pipeline running live, findings streaming in. | Phase 1 |
| 06 | `/app/reports/[reportId]` | Audit Report Overview | Completed report: score, findings, next actions. | Phase 2 |
| 07 | `/app/reports/[reportId]/findings/[findingId]` | Finding Detail | One issue: code, impact, patch, test generation. | Phase 2 |
| 08 | `/app/reports/[reportId]/tests` | Generated Tests | Foundry/Hardhat tests, coverage by finding. | Phase 2 |
| 09 | `/app/cost-guard` | Cost Guard | Gas / RPC / cron / deploy cost intelligence. | Phase 4 |
| 10 | `/app/proofs` | On-chain Proof & Reports | Verify report proofs + ERC-8004 reputation. | Phase 3 |

[LOCKED] **Scope cut for MVP.** Audit Studio ships **two input modes only - Paste Code and Contract Address.** Upload File and GitHub Repo are visible-but-disabled tabs with a "Coming soon" chip. Building four ingestion paths in three weeks is how a demo breaks. [ESCALATE] before adding a third mode.

**Navigation principle.** Public site (`/`) uses a top nav bar. The internal product (`/app/*`) uses a persistent left sidebar + a top utility bar. Brand, color, badges, typography, and card shape are identical across all pages - one platform, not ten mockups.

## 5. Design system v2 - "Obsidian" (dark) [LOCKED]

This section replaces the light-theme system entirely. It is the founder-approved direction. Every page prompt assumes it.

**Design intent.** Calm, dark, precise. An operator console for a security professional - not a pastel SaaS dashboard, not a neon crypto site. The reference aesthetic: near-black canvas, one confident signal-green accent, heavy grotesk headlines, monospace where data lives. Restraint is the brief. The Greek "overseer" brand survives as *thin green line-art* - arch, column, proof-cube, shield rendered as 1px strokes on dark, never as filled illustration.

### 5.1 Color tokens

Define these as CSS custom properties on `:root` and consume them through Tailwind theme extension. [LOCKED] Do not hardcode hex values in components.

| Token | Value | Usage |
|---|---|---|
| `--canvas` | `#0A0E0C` | App background. Near-black, faint green-black. |
| `--surface-1` | `#10150F` | Cards, panels. |
| `--surface-2` | `#161C17` | Raised elements: inputs, dropdowns, hover rows. |
| `--surface-3` | `#1E2620` | Active/selected rows, popovers. |
| `--terminal` | `#070908` | Code panels, log terminals - pure-black feel. |
| `--border-subtle` | `rgba(255,255,255,0.06)` | Default card/divider borders. |
| `--border-emphasis` | `#2C3630` | Focused inputs, active card outline. |
| `--green-500` | `#27B567` | Primary buttons, primary CTAs. |
| `--green-400` | `#3FD98A` | Accents, eyebrows, links, active nav, progress fill, hover. |
| `--green-300` | `#73E7AC` | Highlights, sparkline strokes, focus glow. |
| `--on-green` | `#06140E` | Text/icons on a green fill. |
| `--text-hi` | `#F3F6F4` | Headings, primary text. |
| `--text-mid` | `#AEB8B2` | Body copy, descriptions. |
| `--text-low` | `#6B756F` | Metadata, table secondary, captions. |
| `--text-code` | `#C8D2CC` | Default code text. |
| `--danger` | `#FF5C5C` | Critical severity, errors. |
| `--high` | `#FF8A4C` | High severity (distinct from critical red). |
| `--warning` | `#F5B544` | Medium severity, cost alerts. |
| `--success` | `#3FD98A` | Verified, completed, low-risk, passing. |
| `--info` | `#5BA8FF` | Live logs, neutral system states, guidance. |

**Severity-to-color is [LOCKED] and global:** Critical `--danger`, High `--high`, Medium `--warning`, Low `--success`, Info `--info`. The same finding never changes color between two pages.

**Severity pills on dark:** filled pill at ~14% opacity of the severity color as background, full-opacity color as text, 1px border at ~30% opacity. Never a fully saturated solid block - it vibrates on dark.

### 5.2 Typography

- **Display / headings:** a heavy geometric grotesk. [FLEXIBLE] Recommended: **"General Sans"** (Semibold 600 / Bold 700) via Fontshare, or **"Clash Grotesk"**. Fallback: **Inter** with tight tracking (`-0.02em`). Headlines are confident and large; tracking is slightly negative.
- **UI / body:** **Inter** (400 / 500 / 600). All interface text, tables, descriptions.
- **Mono:** **JetBrains Mono** or **Geist Mono**. Code panels, log terminals, hashes, addresses, chain IDs, ABI previews, KPI numeric values where a "data" feel helps.
- [LOCKED] No decorative or "crypto" display fonts. No all-caps body text. Eyebrows/section-labels may be uppercase mono at small size with `+0.12em` tracking and `--green-400` color.

**Type scale (desktop):** Display 48-64 / H1 32 / H2 24 / H3 18 / Body 15 / Small 13 / Caption 12 / Mono-data 13-14. Line-height 1.5 for body, 1.15 for display.

### 5.3 Layout and shape

- App shell: **260-280px** left sidebar (`--surface-1`), **64px** top utility bar, **28px** content padding.
- Card radius **14px**; pills/chips **999px**; inputs/buttons **10px**.
- Borders are 1px `--border-subtle`. Elevation is conveyed by surface-level change (`--surface-1` to `--surface-2`), **not** by heavy drop shadows. Allowed shadow: a single soft `0 1px 0 rgba(0,0,0,0.4)` plus, on key cards, a barely-there green glow `0 0 0 1px rgba(63,217,138,0.04)`.
- Generous whitespace. Dense data lives in tables and code panels; everything else breathes.
- Grid: 12-column, 24px gutters, max content width ~1440px centered on `/` and `/app` overview.

### 5.4 Component primitives - [LOCKED] build once, reuse everywhere

| Component | Spec |
|---|---|
| `ArchonLogo` | Abstract overseer mark (arch / A) in `--green-400` line-art + "ARCHON" wordmark in display font. |
| `MainnetBadge` | "Mantle Mainnet" label, radial chain glyph, pulsing `--success` dot, "Live" text. On every internal page. |
| `RiskScoreCard` | Large mono numeric score /100, severity pill, segmented bar, "How is this calculated?" link. |
| `SeverityPill` | Per 5.1 rules. Props: `severity`, `size`. |
| `CodePanel` | Monaco-backed. Line numbers, syntax highlight, highlightable line ranges, copy + fullscreen, `--terminal` background, language/version footer. |
| `FindingCard` | Severity icon, title, severity pill, `file:line`, status chip, timestamp. |
| `ProofCard` | Report hash, tx hash, metadata URI, explorer link, verified state. Copy icon on every hash. |
| `Stepper` | Vertical pipeline. States: completed (`--success` check), active (`--green-400` pulsing ring + spinner), queued (`--text-low`), failed (`--danger`). |
| `CostMetricCard` | Metric value (mono), trend arrow, Recharts sparkline, recommendation link. |
| `TestCoverageBar` | Finding category, covered/total, percentage, progress bar in `--green-400`. |
| `LogTerminal` | `--terminal` bg, mono, timestamped lines, `INFO`/`WARN`/`ERROR` colored tags, auto-scroll, "View full log". |
| `EmptyState` | Line-art glyph, one-line explanation, single primary action. One per major surface. |

[LOCKED] Every code panel has copy + fullscreen and readable line numbers. Every table has search/filter + an empty state. Every chart has axis labels and human-readable units. These are acceptance criteria, not nice-to-haves.

## 6. Tech stack [LOCKED]

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | No `any` without an inline comment justifying it. |
| Styling | Tailwind CSS **v3** + shadcn/ui | [LOCKED] v3, not v4 - see Phase 0 anticipated bugs. |
| Icons | lucide-react | Single icon set. No mixed icon libraries. |
| Code views | Monaco Editor | Solidity highlighting; lazy-loaded. |
| Charts | Recharts | Donuts, stacked bars, sparklines. |
| DB | Supabase (managed Postgres) | Free tier. Single shared `pg` pool OR Supabase client - pick one in Phase 0. |
| Queue / cache | BullMQ + Redis | Worker queue + AI response cache. |
| Static analysis | Slither + solc-select | Pinned solc 0.8.20 / 0.8.24 / 0.8.26 pre-installed. |
| AI | OpenAI `gpt-4o-mini` | Reasoning enrichment (batched, cached) + chatbot (streamed). [LOCKED] Not larger - cost. |
| Chain | viem + wagmi | Mantle Mainnet (chain ID 5000, native token MNT). |
| Proof storage | IPFS pinning (web3.storage / Pinata free tier) | Report metadata JSON to metadata URI. |
| Process mgmt | pm2 | `archon-web`, `archon-worker`. |
| Proxy / TLS | Caddy (or nginx) | Auto-TLS. |
| Validation | Zod | Every API route input. Every external response. |
| Logging | pino | Redact secrets - see Phase 0. |

[ESCALATE] if any pinned major version is unavailable or has a breaking change at build time. [FLEXIBLE] the exact minor versions; lock them in `package.json` and commit the lockfile.

## 7. Repository layout [LOCKED at the top level, FLEXIBLE within]

A single Next.js app plus a worker that shares code with it. Not a heavy monorepo - one `package.json`, one install.

```
archon/
  app/                         # Next.js App Router
    (marketing)/page.tsx        # 01 Landing
    app/
      layout.tsx                # internal shell: sidebar + top bar
      page.tsx                  # 02 Workspace Overview
      audit/new/page.tsx        # 03 Audit Studio
      context/page.tsx          # 04 Contract Context Explorer
      scans/[scanId]/page.tsx   # 05 Live Scan Progress
      reports/[reportId]/
        page.tsx                # 06 Audit Report Overview
        findings/[findingId]/page.tsx  # 07 Finding Detail
        tests/page.tsx          # 08 Generated Tests
      cost-guard/page.tsx       # 09 Cost Guard
      proofs/page.tsx           # 10 On-chain Proof & Reports
    api/
      scans/route.ts            # POST create scan -> enqueue job
      scans/[id]/route.ts       # GET scan status
      scans/[id]/stream/route.ts# GET SSE live updates
      reports/[id]/route.ts     # GET report
      chat/route.ts             # POST chatbot (streamed)
      proofs/route.ts           # POST record a logged proof
      health/route.ts           # GET health
  components/
    ui/                         # shadcn primitives
    archon/                     # ArchonLogo, MainnetBadge, RiskScoreCard, ...
  lib/
    db/                         # schema, queries, pool
    queue/                      # BullMQ setup, job types
    scan/                       # pipeline stages 1-6 (shared with worker)
    chain/                      # viem/wagmi, Mantle config, ERC-8004 ABIs
    ai/                         # OpenAI client, prompts, cache
    proof/                      # hashing, IPFS pinning
  worker/
    index.ts                    # BullMQ consumer entrypoint
  contracts/                    # demo Solidity for the demo flow
  docs/
    archon-architecture.svg     # the diagram
    decisions/                  # ADRs
    DEVIATIONS.md               # running log of LOCKED-intent-preserving changes
    demo-script.md
  scripts/                      # provisioning, seed, smoke-test
  .env.example
  package.json
  tailwind.config.ts
  ARCHON_EOF
echo "Part I written: $(wc -l < archon-build-plan.md) lines"
---

# PART II - THE PHASE PACK

Six phases, 0 through 5. Each is written as a self-contained prompt the executor can lift directly. Each phase ends with a runnable, demoable increment and a green acceptance checklist. **Do not start a phase until the previous one's checklist passes.**

Every phase prompt has the same shape:
1. **Mission** - what this phase delivers, in one paragraph.
2. **Control summary** - the LOCKED / FLEXIBLE / ESCALATE items specific to the phase.
3. **Preconditions** - what must already be true.
4. **Build** - file structure, contracts, implementation notes.
5. **Anticipated bugs** - the failure modes we already know about, and the fix.
6. **Acceptance criteria** - bash-checkable where possible.
7. **Definition of done** - the human-judgable bar.

A reminder the executor should keep in working memory: **you have breathing room.** Within a phase, the order you build files, the helper functions you extract, the way you structure a component's internals - all yours. What you may not do is change a LOCKED contract (a route shape, a DB column, a pipeline stage, a budget rule) or skip an acceptance criterion silently. If something fights you, prefer a documented deviation over a silent one.

---

## PHASE 0 - Foundations and Infrastructure

### Mission

Stand up everything the product sits on, end to end, with nothing fake: the repo, the VM, the database, the queue, the dark design system, the app shell, the health endpoint, and a deploy pipeline. At the end of Phase 0 there are no features - but there is a real, deployed, dark-themed Archon shell reachable over HTTPS, a database that accepts writes, a worker that consumes a queue, and CI that goes green. Phase 0 is "boring done right." Every later phase assumes it.

### Control summary

- [LOCKED] Single VM topology (Section 3). One `package.json`. Tailwind v3. The Obsidian dark token set (Section 5.1) exactly.
- [LOCKED] No secrets in the repo. `.env.example` is committed; `.env` is not. pino redaction configured before the first real secret exists.
- [FLEXIBLE] Caddy vs nginx. Local Redis vs Upstash. The exact shadcn component set scaffolded now vs later. ADR each.
- [ESCALATE] If the VM cannot run Slither's Python toolchain, or the chosen Node version conflicts with Next 15. If Supabase free-tier limits look too tight for the demo. If the domain/TLS cannot be obtained.

### Preconditions

- A Google Cloud VM exists, Ubuntu LTS, SSH access confirmed.
- A domain (or you accept a free subdomain / the bare VM IP - [ESCALATE] if a domain is required for the demo and none exists).
- An OpenAI API key, a Supabase project, and a funded Mantle wallet are available as env values (not needed running until later phases, but slots exist now).

### Build

**0.1 - Provision the VM.** Write `scripts/provision.sh` (idempotent). It installs: Node 20 LTS (verify Next 15 compatibility - [ESCALATE] if not), pnpm, Python 3.10+, `pipx`, Slither via `pipx install slither-analyzer`, `solc-select` with versions `0.8.20`, `0.8.24`, `0.8.26` installed and `0.8.24` set as default, Redis, Caddy, and pm2 globally. The script prints a versions summary at the end. Re-running it must be safe.

**0.2 - Scaffold the app.** Next.js 15 App Router + TypeScript strict. Tailwind **v3**. shadcn/ui initialized. lucide-react. Folder layout exactly per Section 7. `tsconfig` strict, `noUncheckedIndexedAccess` on. ESLint + Prettier + a pre-commit hook (`pnpm typecheck && pnpm lint`).

**0.3 - Implement the Obsidian design system.** This is the visible deliverable of Phase 0.
- `app/globals.css`: declare every token from Section 5.1 as a CSS custom property on `:root`. Load General Sans (or Clash Grotesk) for display, Inter for UI, JetBrains Mono for mono - self-host the font files under `app/fonts/` (do not hot-link from a CDN; offline-safe and faster).
- `tailwind.config.ts`: extend `theme.colors`, `theme.fontFamily`, `theme.borderRadius` to reference the CSS variables. **Add a `safelist`** for any class name that will be constructed dynamically (severity colors, status colors) - see anticipated bugs.
- Build the component primitives from Section 5.4 as real components in `components/archon/`, each with a Storybook-less but self-demoing `/app/_dev/tokens` page (dev-only, not linked in nav) that renders every primitive in every state. This page is how the founder signs off on the look before any feature is built.

**0.4 - The app shell.** `app/app/layout.tsx`: the internal shell - 264px left sidebar on `--surface-1` with nav items (Overview, Audit Studio, Contract Context, Reports, Findings, Generated Tests, Cost Guard, On-chain Proof, Settings), a 64px top utility bar with workspace switcher, a global search input ("Search audits, contracts, findings..."), the `MainnetBadge`, a notification bell, and a wallet chip (non-functional placeholder this phase). The marketing layout is a separate group with a top nav bar. Both share `ArchonLogo`, colors, type.

**0.5 - Database.** In Supabase, create the schema below. Commit it as `lib/db/schema.sql` and apply it. [LOCKED] table and column names - later phases depend on them.

```
scans         (id uuid pk, source_kind text, source_ref text, source_code text,
               network text default 'mantle-mainnet', scan_depth text,
               status text, progress int default 0, current_stage text,
               created_at timestamptz, started_at timestamptz, finished_at timestamptz,
               error text)
reports       (id uuid pk, scan_id uuid fk, contract_name text, risk_score int,
               severity_counts jsonb, scope jsonb, executive_summary text,
               report_hash text, created_at timestamptz)
findings      (id uuid pk, report_id uuid fk, severity text, category text,
               title text, file text, line_start int, line_end int,
               code_snippet text, summary text, why_mantle text,
               exploit_scenario text, recommended_fix text, patch_diff text,
               confidence numeric, gas_impact text, status text default 'open',
               sort_index int)
proofs        (id uuid pk, report_id uuid fk, report_hash text, tx_hash text,
               metadata_uri text, network text, logged_at timestamptz,
               verification_status text, erc8004_ref jsonb)
ai_cache      (cache_key text pk, prompt_version text, response jsonb,
               created_at timestamptz)
```

Decide [FLEXIBLE]: raw `pg` pool vs Supabase client. Whichever - **one shared pool/client instance**, never per-request. ADR it.

**0.6 - Queue + worker skeleton.** `lib/queue/`: BullMQ queue named `archon-scans`, typed job payload `{ scanId: string }`. `worker/index.ts`: a consumer that, this phase, just logs "received scan {id}", marks the scan `status='running'` then `status='done'` after a 2s delay. Real pipeline arrives in Phase 1. Run it as pm2 process `archon-worker`.

**0.7 - Health + logging.** `GET /api/health` returns `{ ok, db, redis, version }` after genuinely pinging the DB and Redis. Configure pino with `redact` covering `req.headers.authorization`, `*.password`, `*.OPENAI_API_KEY`, `*.DATABASE_URL`, `*.PRIVATE_KEY` (list paths explicitly - pino does not deep-traverse).

**0.8 - Deploy + CI.** Caddy reverse-proxies the domain to the Next app, auto-TLS. pm2 runs `archon-web` and `archon-worker`; `pm2 save` + startup hook so they survive reboot. GitHub Actions: on push, `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm build`. [LOCKED, see Appendix E] CI does **not** auto-deploy to anything that bills per build, and does not run on a schedule. Deploy is a manual `scripts/deploy.sh` (git pull, install, build, `pm2 reload`) run over SSH.

### Anticipated bugs - Phase 0

| # | Failure mode | Prevention / fix |
|---|---|---|
| 0-1 | Tailwind v4 auto-installed by a scaffolder; v4's config model differs and shadcn guidance assumes v3. | Pin `tailwindcss@^3` explicitly in `package.json`. Verify `tailwind.config.ts` exists in the v3 format after init. |
| 0-2 | Tailwind purges dynamically built class names (`bg-${severity}`), so severity colors vanish in production. | Never build class names by interpolation. Use a static lookup map `severity -> 'bg-danger/14 text-danger'`. Add a `safelist` regex as a backstop. |
| 0-3 | Next 15 + Node version mismatch; build fails or warns. | `provision.sh` installs Node 20 LTS; `.nvmrc` committed; CI uses the same. |
| 0-4 | `solc-select` has no solc version matching a contract's pragma later. | Pre-install 0.8.20/0.8.24/0.8.26 now. Pipeline (Phase 1) falls back to the highest installed if a pragma asks for something absent, and records it. |
| 0-5 | Slither's pipx install not on PATH for the pm2-spawned worker. | pm2 ecosystem file sets an explicit `PATH` including `~/.local/bin`. Smoke-test `slither --version` from inside the worker process. |
| 0-6 | Self-hosted fonts 404 because `app/fonts/` paths are wrong in `@font-face`. | Use `next/font/local`. Verify the `/app/_dev/tokens` page renders display + mono correctly before sign-off. |
| 0-7 | Secrets committed in the first push. | `.gitignore` has `.env*` except `.env.example` before the first commit. A CI step greps the diff for likely key patterns and fails if found. |
| 0-8 | Supabase connection pool exhaustion later under worker concurrency. | One shared pool, `max: 10`. Phase 1 caps scan concurrency at 2. Document the math in the pool ADR. |
| 0-9 | Health endpoint reports `ok` without really checking dependencies. | It must `SELECT 1` and Redis `PING` and surface failures, not swallow them. |

### Acceptance criteria - Phase 0

```bash
# Shell + HTTPS
curl -fsS https://<domain>/            | grep -qi 'archon'
curl -fsS https://<domain>/app         | grep -qi 'overview'

# Health genuinely green
curl -fsS https://<domain>/api/health  | grep -q '"ok":true'

# Worker consumes the queue (enqueue a test job, then:)
pm2 logs archon-worker --lines 20 --nostream | grep -q 'received scan'

# DB schema applied
psql "$DATABASE_URL" -c "\dt" | grep -E 'scans|reports|findings|proofs|ai_cache'

# CI is green on the latest commit (GitHub Actions UI)

# Design tokens render (manual): visit /app/_dev/tokens - every primitive
# appears in every state, dark canvas, green accent, correct fonts.
```

### Definition of done - Phase 0

A reviewer opens the deployed URL on a phone and a laptop. It is unmistakably dark, calm, and "Archon." The shell navigates. `/api/health` is green. The worker drains a queued job. CI passed. No `.env` in git history. Nothing is faked.

---

## PHASE 1 - The Scan Engine and Live Scan Page

### Mission

Build the heart of the product: a real, read-only scan that a developer can start from Audit Studio and watch run, stage by stage, on the Live Scan page, with deterministic findings streaming in as they are discovered. By the end of Phase 1, pasting the demo contract and clicking "Run Archon Scan" produces an actual Slither-backed analysis, a 7-stage pipeline animating through completion, real findings persisted to the database, and a `reports` row with a risk score. No AI yet, no on-chain yet - just a trustworthy, observable scan.

### Control summary

- [LOCKED] The 7-stage pipeline and its stage names (Section 3): Code Parse, Static Analysis, Mantle Context Fetch, Protocol Rule Engine, AI Reasoning, Test Generation, Report Assembly. The UI and worker must use these exact names. In Phase 1 the AI Reasoning and Test Generation stages run as **structural pass-throughs** (they execute, mark complete, do nothing yet) so the pipeline shape is locked from day one.
- [LOCKED] Scanning is read-only. The worker never sends a transaction. Mantle Context Fetch uses RPC reads and explorer reads only.
- [LOCKED] Two input modes only: Paste Code, Contract Address.
- [FLEXIBLE] How findings are de-duplicated, how Slither output is parsed into the `findings` shape, the SSE reconnection strategy, the exact set of Mantle rules in the Rule Engine (start with 4-6 strong ones).
- [ESCALATE] If Slither cannot analyze the demo contract at all. If the Mantle explorer/RPC has no usable verified-source endpoint for the Contract Address mode. If scan runtime exceeds ~5 minutes on the demo contract.

### Preconditions

Phase 0 done. Slither runnable from the worker. `scans` and `findings` tables exist.

### Build

**1.1 - Demo contracts.** In `contracts/`, commit 2-3 deliberately flawed but **compilable** Solidity files. The primary, `VaultV2.sol`, contains a textbook reentrancy in `withdraw()` (external call before state update), a missing slippage check, and a gas-wasteful pattern. A CI step runs `forge build` (or `solc`) on `contracts/` so a non-compiling demo contract can never land. This contract is the spine of the entire demo - treat it with care.

**1.2 - Audit Studio (`/app/audit/new`).** Two-column dark layout. Left: input tabs (Paste Code active; Upload File and GitHub Repo present but disabled with "Coming soon" chips), a Monaco Solidity editor pre-loaded with `VaultV2.sol`, file selector, reset/fullscreen, a Solidity-version + contract-count + "0 errors" footer. Right: a Scan Configuration card - Network locked to "Mantle Mainnet · Live", Scan Depth segmented control (Quick / Deep / Gas & Cost / Full Report; Deep preselected), Protocol Coverage chips (mETH, cmETH, USDY, Aave V3, Merchant Moe, Agni) with Select All, Advanced toggles (Generate Tests, Include Gas Optimization, Log Proof After Review - all checked), an Estimated Coverage radial meter, and an Audit Notes panel stating scans are read-only. Primary button: "Run Archon Scan". On click it `POST`s to `/api/scans`, gets a `scanId`, routes to `/app/scans/[scanId]`.

**1.3 - `POST /api/scans`.** Zod-validate the body `{ sourceKind: 'paste'|'address', sourceCode?, sourceRef?, scanDepth, protocols[] }`. Insert a `scans` row (`status='queued'`), enqueue an `archon-scans` BullMQ job, return `{ scanId }`. Reject oversized source, malformed addresses, empty code.

**1.4 - The pipeline (`lib/scan/`).** Each of the 7 stages is a pure-ish async function `(ctx) => ctx'` updating a shared `ScanContext`. The worker runs them in order; after each, it writes `progress`, `current_stage`, and any new `findings` rows, and publishes an event (see 1.6).
- *Stage 1 Code Parse:* normalize source, detect pragma, pick a solc version (fallback rule per bug 0-4), confirm it compiles.
- *Stage 2 Static Analysis:* run Slither, parse its JSON output into `findings` rows (severity, category, title, file, line range, snippet). De-dupe.
- *Stage 3 Mantle Context Fetch:* for Contract Address mode, read verified source / ABI / deploy metadata from the Mantle explorer + RPC; for Paste mode, this stage records "n/a - pasted source" and completes. Read-only.
- *Stage 4 Protocol Rule Engine:* fingerprint imports/interfaces/selectors against the protocol registry; run 4-6 deterministic Mantle rules (e.g. oracle heartbeat assumption, L1-data-fee-unaware gas estimate, unchecked external call, missing slippage bound). Emit findings.
- *Stage 5 AI Reasoning:* Phase 1 pass-through (mark complete).
- *Stage 6 Test Generation:* Phase 1 pass-through.
- *Stage 7 Report Assembly:* compute `risk_score` (deterministic formula from severity counts - document it), `severity_counts`, `scope`, insert the `reports` row, set scan `status='done'`.

**1.5 - Worker.** Replace the Phase 0 stub with the real runner: pull the job, load the scan, run stages 1-7, handle failure by setting `scans.status='failed'` + `error`, and **always** set BullMQ `failedReason` on throw. Concurrency 2.

**1.6 - Live updates over SSE.** `GET /api/scans/[id]/stream` is a Server-Sent Events endpoint. The worker publishes stage/finding/log events via Redis pub/sub; the route subscribes and forwards them. The Live Scan page consumes the stream with `EventSource`. On reconnect, the page first re-fetches `GET /api/scans/[id]` for current truth, then resumes the stream - so a refresh mid-scan never loses state.

**1.7 - Live Scan page (`/app/scans/[scanId]`).** Dark. A header card (contract name, Solidity badge, scan ID, started timestamp, status, network, priority, scan type). Left: an Overall Progress bar + the **vertical 7-stage `Stepper`** with the locked stage names, showing completed / active / queued correctly. Right: a "Streaming Findings" panel with a Live indicator and `FindingCard`s appearing as they arrive, severity-filterable. Bottom-right: a `LogTerminal` with timestamped `INFO` lines. When the scan finishes, a clear "View Report" CTA routes to `/app/reports/[reportId]`.

### Anticipated bugs - Phase 1

| # | Failure mode | Prevention / fix |
|---|---|---|
| 1-1 | Slither emits a different JSON shape than expected, or exits non-zero on warnings. | Parse defensively; treat non-zero exit as "analysis completed with issues" not "crash" unless stdout is empty. Snapshot a known-good Slither JSON in tests. |
| 1-2 | The demo contract stops compiling after an edit; the whole demo dies. | CI compiles `contracts/` on every push (bug from 1.1). Never edit the demo contract without re-running that check. |
| 1-3 | SSE connection silently drops behind Caddy/nginx after ~60s idle. | Send a heartbeat comment line every ~15s. Disable proxy buffering for the stream route (`X-Accel-Buffering: no`). |
| 1-4 | React key warnings / row glitches when findings stream in. | Key on `finding.id` (a real uuid), never array index. |
| 1-5 | Worker silently stalls; scan stuck at "running" forever. | A watchdog: if a stage exceeds a timeout, fail the scan with a clear error. Monitor `pm2 logs archon-worker` during the smoke test. |
| 1-6 | BullMQ job stays "active" after a worker crash. | Set `failedReason` on every throw; configure stalled-job recovery; cap attempts at 2. |
| 1-7 | Mantle explorer rate-limits the Context Fetch stage. | Wrap every external call in retry-with-backoff + timeout; cache per-address context briefly. If the explorer is unusable, [ESCALATE]. |
| 1-8 | Monaco bloats the bundle / slows first paint of Audit Studio. | Lazy-load Monaco (`dynamic`, `ssr:false`); show a skeleton until ready. |
| 1-9 | The risk score looks arbitrary to a judge. | Document the formula in `docs/decisions/` and link it from the score's "How is this calculated?" affordance later. |

### Acceptance criteria - Phase 1

```bash
# Create a scan from the demo contract
SID=$(curl -fsS -X POST https://<domain>/api/scans \
  -H 'content-type: application/json' \
  -d @scripts/fixtures/demo-scan.json | jq -r .scanId)
test -n "$SID"

# Pipeline runs and completes within ~5 min
# (poll) status reaches 'done'
curl -fsS https://<domain>/api/scans/$SID | jq -r .status   # -> done

# Findings were persisted
psql "$DATABASE_URL" -c \
 "SELECT count(*) FROM findings f JOIN reports r ON r.id=f.report_id
  JOIN scans s ON s.id=r.scan_id WHERE s.id='$SID';"          # >= 5

# A report row exists with a real score
psql "$DATABASE_URL" -c \
 "SELECT risk_score FROM reports r JOIN scans s ON s.id=r.scan_id
  WHERE s.id='$SID';"                                          # 1..100

# CI compiles the demo contracts (GitHub Actions: 'forge build contracts')
```

Manual: open `/app/scans/$SID` mid-scan, watch all 7 stages animate; reload the page mid-scan and confirm state resumes; confirm findings stream into the right-hand panel.

### Definition of done - Phase 1

A developer pastes the demo contract, clicks Run, and watches a real scan: seven named stages progressing, the reentrancy finding (and others) appearing live, a log terminal ticking, and a finished report with a defensible risk score. Refreshing mid-scan does not break it. The reentrancy in `withdraw()` is genuinely detected, not hardcoded.

---

## PHASE 2 - Reasoning, Reports, Findings, and Generated Tests

### Mission

Turn raw findings into a credible security report. Activate the AI Reasoning stage so every finding gains a plain-English summary, a Mantle-specific impact, an exploit scenario, a recommended fix, and a confidence score. Activate the Test Generation stage so the report produces Foundry tests. Build the three report-facing pages: Audit Report Overview, Finding Detail with a patch diff, and Generated Tests with coverage. By the end of Phase 2, a completed scan is a professional, navigable audit a developer would actually act on.

### Control summary

- [LOCKED] AI enrichment is **batched and cached** (`ai_cache` table). Model is `gpt-4o-mini`. Reasoning never invents line numbers, file names, or facts not present in the deterministic finding - it explains and recommends, it does not discover. Careful language only (findings/recommendations, never guarantees).
- [LOCKED] AI Reasoning and Test Generation slot into stages 5 and 6 of the existing pipeline - the pipeline shape from Phase 1 does not change.
- [FLEXIBLE] Prompt wording and structure; the patch-diff rendering library; the coverage-by-finding calculation; Foundry vs Hardhat default tab.
- [ESCALATE] If `gpt-4o-mini` output quality is too low to be credible even with good prompts. If OpenAI spend projection for a full demo exceeds the credit budget (see Appendix E).

### Preconditions

Phase 1 done. Pipeline produces deterministic findings + a report. `ai_cache`, `reports`, `findings` tables exist.

### Build

**2.1 - AI client + cache (`lib/ai/`).** A thin OpenAI wrapper. Every call: a `promptVersion` string constant, a deterministic `cache_key` = hash of `(promptVersion + finding fingerprint)`. **Always include `promptVersion` in the key** - otherwise stale enrichments survive a prompt change. Check `ai_cache` first; on miss, call the model, store the result. Wrap in retry + timeout. Phase 2 uses non-streaming batch calls (streaming is only for the chatbot in Phase 3).

**2.2 - Stage 5 AI Reasoning (real).** For each finding, send the deterministic facts (severity, category, code snippet, file/line, protocol matches) and ask `gpt-4o-mini` for: `summary`, `why_mantle`, `exploit_scenario` (concise, non-graphic, software-impact framed), `recommended_fix`, `patch_diff` (a minimal unified diff applying the fix), `confidence` (0-1), `gas_impact`. Validate the model's JSON with Zod; on invalid JSON, retry once, then fall back to a deterministic template so a finding is never blank. Write the enriched fields back to the `findings` row. Batch findings to limit calls; cache everything.

**2.3 - Stage 6 Test Generation (real).** From the findings, generate a Foundry test file (e.g. `test/VaultV2.t.sol`): a `setUp()` that forks Mantle Mainnet (`vm.createSelectFork`) and prepares attacker/user/admin addresses, plus one test per major finding category that reproduces the issue and asserts the fixed behavior. Also produce a coverage-by-finding map (which categories have tests). Store generated tests on the report (a `tests` jsonb or a `report_tests` table - [FLEXIBLE], ADR it).

**2.4 - Audit Report Overview (`/app/reports/[reportId]`).** Dark. Breadcrumb, "Audit Report" title + "Completed" status, metadata row. Top-right: Share Report, Download JSON, Generate Proof (Generate Proof is present but wired in Phase 3). Top summary cards: `RiskScoreCard`, a Severity Distribution donut (Recharts), a Scope card (contracts / lines / dependencies / Solidity / scan type), a Protocol card (Network Mantle Mainnet, Chain ID 5000, block, scan duration). An Executive Summary card (AI-written, 3-4 sentences) and a Key Takeaways checklist. A tabbed table - Findings / Mantle-Specific Risks / Gas & Cost Optimizations / Recommended Fixes / Next Actions - with columns Severity, Category, Title, Lines, File, Status; rows route to Finding Detail. Search + filter + empty state on the table.

**2.5 - Finding Detail (`/app/reports/[reportId]/findings/[findingId]`).** Dark, split layout. Header: severity pill, finding ID, title, metadata row (contract, function, visibility, status), Previous/Next finding controls, Actions menu. Left: a `CodePanel` with the vulnerable line range highlighted and inline annotation callouts ("External Call", "State Update After Call"); below it a Suggested Patch / Diff View tab pair rendering `patch_diff` (red removed / green added on dark). A "Generate Test for This Finding" CTA. Right: stacked cards - Severity, Summary, Why It Matters on Mantle, Exploit Scenario, Recommended Fix, Gas Impact, Confidence, References. Professional engineering tone; no drama.

**2.6 - Generated Tests (`/app/reports/[reportId]/tests`).** Dark. Title + "Mantle Mainnet Native" badge. Tabs: Foundry / Hardhat / Edge Cases. A large `CodePanel` showing the generated test file (LOC count, Solidity version, framework badge). Right: Test Summary cards (Total Tests, Edge Cases, Suggested Fork Mode "Mantle Mainnet Fork", Chain ID 5000), Coverage-by-Finding `TestCoverageBar`s (Reentrancy, Slippage, Access Control, Oracle Fallback, Gas Regression), and a Test Matrix table. Copy All / Export / Open in IDE buttons (Open in IDE is a labeled future-integration affordance, not functional). A note that tests run locally or in fork mode - never auto-executed on mainnet.

### Anticipated bugs - Phase 2

| # | Failure mode | Prevention / fix |
|---|---|---|
| 2-1 | `gpt-4o-mini` returns prose around the JSON, breaking `JSON.parse`. | System prompt: "Respond with only a JSON object, no prose, no markdown fences." Strip fences defensively. Zod-validate; retry once; then template fallback. |
| 2-2 | AI cache key omits `promptVersion`; stale output after a prompt edit. | Key = hash(`promptVersion` + finding fingerprint). Bump `promptVersion` whenever a prompt file changes. |
| 2-3 | AI invents a line number or a fix unrelated to the snippet. | Send only the real snippet + facts; instruct "explain and recommend; do not introduce facts not in the provided code." Confidence below a threshold is shown as such, not hidden. |
| 2-4 | OpenAI spend balloons during repeated demo runs. | Cache aggressively; the demo contract's findings should be ~100% cache hits after the first run. Log estimated tokens per scan. See Appendix E. |
| 2-5 | The patch diff does not actually apply / is malformed. | Generate minimal unified diffs; render as display only (not applied programmatically). If a diff fails a sanity check, fall back to before/after code blocks. |
| 2-6 | Foundry fork test references an env var (`FORK_BLOCK`) that is not set. | The generated test reads fork config from env with a documented default; the Generated Tests page notes required env vars. |
| 2-7 | Donut/chart renders with no labels or unreadable on dark. | Recharts with explicit label config; severity colors from tokens; legend with counts. |
| 2-8 | Report JSON export leaks internal fields. | Export a defined, whitelisted report schema - not a raw DB dump. |

### Acceptance criteria - Phase 2

```bash
# Re-run the demo scan; findings now carry AI enrichment
psql "$DATABASE_URL" -c \
 "SELECT count(*) FROM findings WHERE summary IS NOT NULL
  AND recommended_fix IS NOT NULL;"                            # >= 5

# Cache works: a second identical scan is mostly cache hits
pm2 logs archon-worker --lines 50 --nostream | grep -ci 'ai_cache hit'  # > 0

# Report pages render
curl -fsS https://<domain>/app/reports/<RID>            | grep -qi 'executive summary'
curl -fsS https://<domain>/app/reports/<RID>/tests      | grep -qi 'foundry'

# Generated test file is non-trivial
psql "$DATABASE_URL" -c "SELECT length(tests::text) FROM reports WHERE id='<RID>';"  # large
```

Manual: open the report, click into the reentrancy finding, confirm the highlighted line, the annotations, a coherent exploit scenario, and a patch diff that moves the state update before the external call. Open Generated Tests, confirm a real `setUp()` with a Mantle fork.

### Definition of done - Phase 2

A completed scan is a report a security engineer would respect: a defensible score, a readable executive summary, findings with line-level traceability and sane fixes, and Foundry tests with a Mantle fork. The AI layer explains; it never hallucinates new vulnerabilities. Language is careful throughout.

---

## PHASE 3 - On-chain Proof, ERC-8004, and the Archon Assistant

### Mission

Make Archon trustless. Wire wallet connection on Mantle Mainnet, give Archon its own ERC-8004 identity, and build the one and only on-chain action in the product: explicit, user-approved proof logging. A completed report can be hashed, its metadata pinned to IPFS, a proof logged on Mantle, and a reputation entry posted through ERC-8004 - then verified by anyone on the On-chain Proof page. Also ship the Archon Assistant chatbot, because a working contextual assistant is rare in a hackathon submission and signals product maturity. By the end of Phase 3, Archon is the category it claims to be.

### Control summary

- [LOCKED] Proof logging is the **only** mainnet transaction in the product. It happens **only** after the user reviews a report and explicitly confirms in a modal. No auto-logging, ever.
- [LOCKED] The Generate Proof modal must show: report hash, network (Mantle Mainnet), estimated gas, the connected wallet address, a checkbox "I understand this will log a report proof on Mantle Mainnet", and Cancel / "Sign & Log Proof" buttons. Safety copy: "Scanning is read-only. This action only logs a cryptographic proof of the report; it does not modify the audited contract."
- [LOCKED] The chatbot does not initiate scans, wallet actions, or transactions. It explains and recommends; the user clicks.
- [FLEXIBLE] Whether proof logging writes through a thin Archon proof contract or directly to the ERC-8004 Validation/Reputation registries; the IPFS pinning provider; chatbot conversation persistence (localStorage is fine for MVP).
- [ESCALATE] ERC-8004 live addresses/ABIs on Mantle Mainnet must be confirmed against the actual deployment before integration - do not guess. If gas for a proof is materially more than budgeted. If minting the identity NFT has any non-obvious cost or permission.

### Preconditions

Phases 0-2 done. A funded Mantle wallet. Confirmed ERC-8004 contract addresses on Mantle Mainnet (Appendix B placeholder - replace with verified values; [ESCALATE] if they cannot be verified).

### Build

**3.1 - Chain layer (`lib/chain/`).** viem + wagmi configured for Mantle Mainnet (chain ID 5000, MNT, RPC + explorer URLs from env). The ERC-8004 ABIs (Identity, Reputation, Validation) committed as typed artifacts. A read client for verification; a wallet client path for the single write.

**3.2 - Wallet connect.** Activate the top-bar wallet chip: connect/disconnect, address display, network guard (if the wallet is not on Mantle Mainnet, prompt to switch - do not silently proceed). Reuse a shared Wallet Connect modal.

**3.3 - Archon's ERC-8004 identity.** A one-time setup step (a script in `scripts/`, not a user flow): mint Archon's Identity Registry NFT from the project wallet. Record the resulting agent identity reference in env / a config row. Every proof and reputation entry references it. [ESCALATE] before running this if anything about cost or permissioning is unclear.

**3.4 - Proof pipeline (`lib/proof/`).** Given a report: (a) build a canonical metadata JSON (report summary, severity counts, finding hashes, scanned contract ref, timestamp, Archon identity ref), (b) compute `report_hash` deterministically over the canonical report, (c) pin the metadata JSON to IPFS, get `metadata_uri`, (d) prepare the on-chain call - log the proof and post a Reputation Registry entry referencing the hash + URI. Return an unsigned transaction request for the user's wallet to sign.

**3.5 - Generate Proof flow.** The "Generate Proof" button on the Audit Report page opens the Generate Proof modal (locked spec above). On confirm: the user's wallet signs and sends the transaction; the UI shows a pending state, then on confirmation writes a `proofs` row (`report_hash`, `tx_hash`, `metadata_uri`, `network`, `logged_at`, `verification_status`, `erc8004_ref`) and shows a success state with an explorer link.

**3.6 - On-chain Proof & Reports (`/app/proofs`).** Dark. Title "On-chain Proof & Reports", subtitle, a "Proofs are logged on Mantle Mainnet · Live" badge. Tabs: Report History / Proof Verification. Filters: All / Verified / High Risk / Needs Review. A search field (contract, hash, tx hash). Main table: Contract, Risk Score, Report Hash (shortened + copy), Network, Logged At, Status (Verified / Proof Logged / Pending Review). A right-hand Selected Report panel: contract name/address, Report Hash, Transaction Hash, Metadata URI, Explorer link, Logged At, Network, and a Proof Verified card. The Proof Verification tab independently re-derives the hash from the report and checks it against the on-chain record + ERC-8004 entry - this is the "anyone can verify" surface that wins the trustless argument with judges.

**3.7 - The Archon Assistant chatbot.** A floating launcher bottom-right (~56px, subtle idle pulse). On click, a ~380x580 panel expands (spring physics). Messages stream from `gpt-4o-mini` via `/api/chat` (SSE). A 3-dot thinking animation before the first token; tokens fade in with `will-change: opacity` (no layout jitter). The system prompt is augmented per request with a `contextJson` block describing the current route and any active scan/report/finding - this is what makes it feel smart. Canned first-open prompts: "Explain this finding", "What is the L1 data fee?", "How do I generate a proof?". Conversation persists in `localStorage`. A small grey footer line inside the panel: "Archon Assistant · Mantle Mainnet · [latest proof tx]". The full system prompt is Appendix C.

### Anticipated bugs - Phase 3

| # | Failure mode | Prevention / fix |
|---|---|---|
| 3-1 | ERC-8004 ABI/address assumptions are wrong; the write reverts. | [ESCALATE] - verify against the live Mantle deployment first. Dry-run with a static call / simulation before the real send. |
| 3-2 | Wallet is on the wrong network; transaction goes nowhere or to the wrong chain. | Network guard before enabling "Sign & Log Proof". Disable the button until chain ID === 5000. |
| 3-3 | `report_hash` is non-deterministic (key ordering, whitespace) so verification later fails. | Canonicalize the report object (sorted keys, fixed serialization) before hashing. Unit-test that the same report hashes identically twice. |
| 3-4 | IPFS pin succeeds but the gateway is slow/unreachable at verify time. | Store the raw metadata in the DB too; the gateway URI is a convenience, not the source of truth. Try multiple gateways on read. |
| 3-5 | Gas estimate shown in the modal differs wildly from actual. | Estimate live via the RPC just before showing the modal; show it as an estimate; handle estimation failure gracefully. |
| 3-6 | SSE chatbot stream cut off behind the proxy (same class as bug 1-3). | Heartbeat + disable buffering on `/api/chat`. |
| 3-7 | Chatbot answers outside its knowledge (prices, unrelated chains) or claims to perform actions. | System prompt hard boundaries (Appendix C): no price talk, no action-taking, redirect off-scope politely. |
| 3-8 | Double-sign / double-log if the user clicks twice. | Disable the button on first click; idempotency on the `proofs` insert keyed by `report_hash`. |
| 3-9 | Private key handling - the project wallet key must never reach the browser or logs. | The user-facing proof is signed by the *user's* wallet. Archon's own identity/setup script runs server-side only; key in env, pino-redacted, never shipped to the client bundle. |

### Acceptance criteria - Phase 3

```bash
# Wallet + network guard (manual): connecting a non-Mantle wallet shows a switch prompt.

# A proof can be logged (manual, testnet-or-mainnet per budget): review report,
# Generate Proof, confirm modal, sign -> a proofs row appears:
psql "$DATABASE_URL" -c "SELECT tx_hash, metadata_uri, verification_status FROM proofs ORDER BY logged_at DESC LIMIT 1;"

# Hash determinism
pnpm test -- proof-hash      # same report hashes identically across runs

# Verification surface
curl -fsS https://<domain>/app/proofs | grep -qi 'proof verification'

# Chatbot responds with context
curl -fsS -X POST https://<domain>/api/chat -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"what does this product do"}],"context":{"route":"/app"}}' \
  | grep -qi 'archon'
```

Manual: on the Proof Verification tab, re-verify a logged report - the re-derived hash matches the on-chain record. Open the chatbot on a finding page and ask "why does this matter" - it answers with the finding's actual context.

### Definition of done - Phase 3

Archon has an on-chain identity. A reviewed report can be hash-anchored on Mantle with one explicit, well-explained signature, and then independently verified by anyone on the Proof page. The chatbot is contextual, calm, and never oversteps. The product now *is* a trustless auditor agent, not a tool that says it is.

---

## PHASE 4 - Cost Guard, Context Explorer, Workspace, Landing, and Polish

### Mission

Complete the surface and make it demo-perfect. Build the four remaining pages - Cost Guard, Contract Context Explorer, Workspace Overview, and the Landing page - then do a full pass on empty/loading/error states, responsiveness, copy, and the dark-theme consistency across all ten pages. By the end of Phase 4, Archon is a coherent, polished product a judge can land on cold and understand.

### Control summary

- [LOCKED] Cost Guard recommendations are advisory. The Auto-remediate toggle ships **off by default** and the product never touches the user's cloud account. Context Explorer is read-only context fetching, not a transaction flow. The Landing CTA leads to Audit Studio. No RWA/yield/portfolio language anywhere.
- [FLEXIBLE] Whether Cost Guard metrics are derived from real scan telemetry or curated realistic sample data for the demo (be honest in copy either way - "sample" if sample). The exact landing-page section order. Which Workspace Overview widgets pull live vs seeded data.
- [ESCALATE] If real cost telemetry cannot be produced and the founder wants it to look live without a "sample data" label.

### Preconditions

Phases 0-3 done. Reports, proofs, findings exist in the DB to populate Workspace and Proof surfaces.

### Build

**4.1 - Contract Context Explorer (`/app/context`).** Dark. A wide address input prefilled with a realistic Mantle address + "Fetch Context" button. On fetch (read-only, reuses the Phase 1 Mantle Context stage logic): summary cards (Verified Source, Contract Type, Protocol Matches, Owner/Admin, Last Updated) with badges; stacked panels for Contract Metadata, ABI Preview ("View Full ABI"), External Dependencies, Known Protocol Interactions, Token Exposure, Risk Notes, Admin Permissions; copy icons on every address. Right column: a Protocol Matches card (mETH, USDY, Aave V3, Merchant Moe, Agni - category, confidence %, link) and Quick Actions (Open in Mantle Explorer, Run Audit in Audit Studio, Generate On-chain Proof, Export Contract Report).

**4.2 - Cost Guard (`/app/cost-guard`).** Dark. Title + subtitle, tabs (Overview / Gas / Infrastructure / RPC / AI Usage / Alerts / Settings), Mantle selector + date range + refresh. KPI cards (Estimated Monthly Spend, Gas Saved Potential, RPC Usage, AI Token Spend) with sparklines. A Cost Trend stacked bar chart (Gas / Infra / AI Token), a Gas Hotspots donut, a Recommendations card (Reduce polling frequency, Add cache layer, Batch RPC calls, Prevent redundant deployments, Add idempotency keys - each with an impact tag + estimated monthly saving). A Runaway Cost Guard section with alert cards (High Cron Frequency, Build Trigger Loops, Excessive RPC Calls, Missing Queue) and an Auto-remediate toggle **off by default**. A Top Cost Drivers card. This page is also a quiet narrative device: it shows Archon understands the exact failure that nearly sank a past project - runaway build/deploy spend.

**4.3 - Workspace Overview (`/app`).** Dark. Replace the Phase 0 placeholder with the real command center: KPI row (Audits This Week, Critical Findings Prevented, Estimated Gas Saved, Proofs Logged On-chain), a Recent Reports table, an Active Scans panel with progress bars, a Quick Actions panel (New Audit, Review Findings, Generate Tests, Run Cost Guard), a Recent Activity timeline, and a Workspace Health card (Overall Risk Posture, Contracts Monitored, Active Alerts, Last Scan). Pulls live data where it exists; clearly seeded otherwise.

**4.4 - Landing (`/`).** Dark, the showcase page. Top nav (logo, Product / Audit Studio / Cost Guard / Reports / Docs, "Start Mainnet Audit" CTA). Hero: headline "AI-Powered Safety Layer for Mantle Mainnet", subtext naming ERC-8004 trustless auditing, chips (Mantle Mainnet Native, ERC-8004 Trustless, AI Risk Detection, On-chain Proof). A restrained Greek/proof-gate line-art hero visual on dark - no noisy crypto graphics - with a "Built for Mantle Mainnet · Live" status card. A four-card product preview (Audit Studio, Contract Context, Cost Guard, On-chain Proof) each with a tiny real UI snippet. A "From Code to On-chain Confidence in 3 Steps" flow (Scan Contract -> Analyze Risk -> Log Proof On-chain). A four-column footer (Product / Resources / Company / Connect). The page must lead with the ERC-8004 trustless angle - that is the category claim - and the main CTA must reach Audit Studio.

**4.5 - Polish pass (all 10 pages).** Build the shared modals and states from Appendix F: Wallet Connect, Generate Proof confirmation, Proof pending, Proof verified, Scan failed, Empty Reports, Empty Findings, Contract Not Verified warning, AI Output Validation error, RPC Rate-limit warning, Export Report modal. Then a consistency sweep: every internal page shows the `MainnetBadge`; every table has search/filter + an empty state; every code panel has copy + fullscreen; every chart has labels; the dark tokens are used everywhere (grep for stray hex); responsive down to a narrow viewport; loading skeletons on every async surface; careful, non-guarantee language throughout.

### Anticipated bugs - Phase 4

| # | Failure mode | Prevention / fix |
|---|---|---|
| 4-1 | Cost Guard looks invented and a judge calls it out. | If data is sample data, label it "sample" in small caps near the charts. Honesty reads as confidence; fakery reads as desperation. |
| 4-2 | Landing page reintroduces RWA/yield/portfolio language by accident. | A CI grep on `app/(marketing)/` for a denylist of terms (yield, portfolio, RWA, trading, allocation) fails the build. |
| 4-3 | Empty states missing; a fresh workspace looks broken. | Appendix F lists every required empty state; the QA checklist verifies each. |
| 4-4 | Stray hardcoded hex colors break dark consistency. | A CI grep for `#` hex literals in `components/` and `app/` (outside `globals.css` and `tailwind.config.ts`) warns or fails. |
| 4-5 | Recharts re-renders thrash on the Workspace page. | Memoize chart data; stable component identity; avoid inline data construction in render. |
| 4-6 | Mobile/narrow layout of the app shell collapses badly. | Sidebar collapses to icons or a drawer below a breakpoint; verify each page narrow. |
| 4-7 | Context Explorer hammered with rapid fetches. | Debounce; reuse the Phase 1 retry/cache wrapper; show a clear loading state. |

### Acceptance criteria - Phase 4

```bash
# All ten routes return 200 and carry the Mantle badge on internal pages
for r in / /app /app/audit/new /app/context /app/cost-guard /app/proofs; do
  curl -fsS https://<domain>$r > /dev/null && echo "$r ok"
done

# Landing leads with the category claim
curl -fsS https://<domain>/ | grep -qi 'erc-8004'

# No forbidden scope language on the marketing page (CI grep, must be empty)
grep -riE 'yield|portfolio|rwa|autonomous trading' app/\(marketing\)/ || echo "clean"

# No stray hex outside the token files (CI grep)
grep -rE '#[0-9A-Fa-f]{6}' components/ app/ --include='*.tsx' | grep -v globals.css || echo "clean"
```

Manual: walk all 10 pages on desktop and a narrow viewport. Every page is dark, consistent, badged, with empty/loading states. The landing page explains Archon cold in under ten seconds.

### Definition of done - Phase 4

Archon is one coherent product across ten pages. A judge can open the landing page, understand the category, start a scan, read a report, verify a proof, and never hit a broken or empty-looking surface. The dark Obsidian system is consistent everywhere. Nothing is unlabeled fakery.

---

## PHASE 5 - Stretch (only if Phase 4 is fully stable)

Phase 5 is opt-in. Do not start it at the cost of Phase 4 stability. Each item is independent - cherry-pick.

- **Public Report Viewer.** A shareable, read-only `/r/[reportId]` route for judges and contract owners - no login, no app shell, just the report + proof verification. High judge-value, low risk.
- **More Mantle rules.** Expand the Rule Engine from 4-6 rules to a deeper set; each new rule needs a fixture finding and an ADR.
- **Challenge flow UI.** A surface for a third party to post an ERC-8004 Validation Registry challenge/attestation against a finding directly from the report - the "trustless" story made interactive.
- **Architecture SVG refresh.** Re-render `docs/archon-architecture.svg` in the Obsidian dark palette for the README.
- **Findings index page.** The `/app/findings` route hinted in the sidebar - a cross-report findings table.

[ESCALATE] before starting Phase 5 to confirm Phase 4 is signed off and there is genuine time left.

---

# PART III - APPENDICES

## Appendix A - Coding conventions [LOCKED]

These apply to every phase. The executor enforces them; review rejects violations.

- TypeScript strict. `noUncheckedIndexedAccess` on. No `any` without an inline comment justifying it.
- Every API route input validated with Zod. Every external response (Slither, OpenAI, RPC, explorer, IPFS) validated or defensively parsed - never trusted raw.
- Every external call wrapped in retry + timeout. No naked `fetch` to a third party.
- Every long-running task runs in the worker, never in a route handler. Route handlers stay fast.
- Every DB query parameterized. No string-concatenated SQL, ever.
- Every secret in `.env`, never committed, never in the client bundle, always pino-redacted.
- React lists keyed on stable IDs, never array index.
- Colors, fonts, radii consumed from design tokens - no hardcoded hex in components.
- One shared DB pool/client, one shared Redis connection - never per-request.
- Pre-commit hook: `pnpm typecheck && pnpm lint`. A broken build never gets committed.
- Every non-trivial decision gets a short ADR in `docs/decisions/`. Every LOCKED-intent-preserving deviation gets a line in `docs/DEVIATIONS.md`.
- Commits are small and descriptive. The git history should read like a build log.

## Appendix B - Environment variables

Commit `.env.example` with every key and a comment; never commit `.env`.

```
# --- App ---
NODE_ENV=production
APP_URL=https://<domain>
APP_VERSION=2.0.0

# --- Database (Supabase) ---
DATABASE_URL=postgres://...               # pooled connection string

# --- Queue / cache ---
REDIS_URL=redis://127.0.0.1:6379

# --- AI ---
OPENAI_API_KEY=sk-...                     # gpt-4o-mini only
AI_PROMPT_VERSION=1                        # bump on any prompt change

# --- Mantle Mainnet ---
MANTLE_RPC_URL=https://...                 # read RPC
MANTLE_EXPLORER_API=https://...            # verified-source / ABI reads
MANTLE_CHAIN_ID=5000

# --- ERC-8004 (VERIFY against the live Mantle deployment before use) ---
ERC8004_IDENTITY_REGISTRY=0x...            # ESCALATE if unverified
ERC8004_REPUTATION_REGISTRY=0x...
ERC8004_VALIDATION_REGISTRY=0x...
ARCHON_AGENT_IDENTITY_REF=                 # filled after the one-time mint script

# --- Project wallet (server-side only, for Archon's own identity setup) ---
ARCHON_WALLET_PRIVATE_KEY=                 # NEVER ships to the client; redacted in logs

# --- IPFS pinning ---
IPFS_PIN_PROVIDER=web3storage
IPFS_PIN_TOKEN=...

# --- Foundry test generation ---
FORK_BLOCK=latest                          # default fork block for generated tests
```

[LOCKED] `ARCHON_WALLET_PRIVATE_KEY` and `OPENAI_API_KEY` never appear in client code, never in logs, never in git. [ESCALATE] the moment ERC-8004 addresses cannot be verified against the live deployment.

## Appendix C - The Archon Assistant system prompt

Ship this as the chatbot's system prompt (Phase 3). `{contextJson}` is built by the frontend per request.

```
You are Archon Assistant, the in-product helper for Archon DevTools - an
AI-powered, ERC-8004 trustless smart-contract auditor native to Mantle Mainnet.

You help developers and hackathon judges understand Archon's outputs, navigate
the product, and learn about Mantle.

PERSONALITY
- Calm, precise, expert. You sound like a senior security engineer who is
  unusually good at explaining things clearly.
- You never hype. No crypto-bro language. No emoji.
- You are direct. If something is risky, you say so. If it is fine, you say so.

KNOWLEDGE
- You know the Archon product surface: the ten routes and what each does, the
  seven-stage scan pipeline, what the findings and the risk score mean.
- You know Mantle Mainnet basics: chain ID 5000, native token MNT, the
  L1-data-fee + L2-execution-fee cost model, and the major protocols
  (mETH, cmETH, USDY, Aave, Merchant Moe, Agni).
- You know ERC-8004 basics: Identity, Reputation, and Validation registries,
  and why Archon uses them to make audits verifiable and challengeable.
- The user message includes the current page's context, so you can speak to the
  specific scan, report, or finding the user is looking at.

BOUNDARIES
- You do NOT start scans, connect wallets, or send transactions. You explain;
  the user clicks.
- You do NOT speculate on token prices or give investment advice.
- You do NOT generate unaudited production code; illustrative snippets only.
- Off-topic (other chains, unrelated subjects) - redirect politely to Archon
  and Mantle.

FORMAT
- Short and scannable. Default to 2-4 sentences.
- For technical points, at most 2-3 bullets.
- Reference findings, pages, or sections by name when relevant.

CURRENT PAGE CONTEXT
{contextJson}
```

## Appendix D - Demo script and submission

The demo is a five-minute story, not a feature tour. Rehearse it.

1. **Land (20s).** Open `/`. "Archon is the first ERC-8004 trustless auditor agent native to Mantle Mainnet." Point at the hero chips.
2. **Scan (60s).** Audit Studio, the demo `VaultV2.sol` pre-loaded, Deep Scan, Run. Cut to the Live Scan page - seven stages animating, the reentrancy finding streaming in live, the log terminal ticking.
3. **Report (60s).** Open the finished report. Risk score, severity donut, executive summary. Click into the reentrancy finding: highlighted line, exploit scenario, the patch diff moving the state update before the external call.
4. **Tests (30s).** Generated Tests - a real Foundry `setUp()` forking Mantle Mainnet, coverage by finding.
5. **Proof (60s).** Back to the report, Generate Proof. The confirmation modal - report hash, network, gas, the explicit checkbox. Sign. Then `/app/proofs`: the proof, the tx hash, and the Proof Verification tab re-deriving the hash and matching it on-chain. "Anyone can verify this audit. Anyone can challenge it. That is the thesis."
6. **Close (30s).** The Archon Assistant answering a contextual question; the Cost Guard page; one line on the roadmap.

Submission checklist: a public repo (MIT), the `docs/archon-architecture.svg` in the README, the deployed URL, a short written pitch leading with the ERC-8004 category claim, and the demo video following the script above.

## Appendix E - Cost discipline [LOCKED - read before provisioning anything]

This appendix exists because a previous project (Xyndicate) burned $2-3K on Vercel: on-demand builds on the largest instance type, triggered every ~30 minutes by frequent commits. That must not recur. The rules:

- **One VM. Flat cost.** All compute - web, worker, Redis, Slither - runs on the single Google Cloud VM you already pay for. There is no second always-on paid service.
- **No on-demand build farms.** No Vercel/Netlify on-demand builds on large instances. The Next app builds *on the VM* via `scripts/deploy.sh`, run manually.
- **CI does not deploy and does not run on a schedule.** GitHub Actions only typechecks, lints, and builds on push. No cron triggers. No auto-deploy to a billed service.
- **Deploy is manual and deliberate.** `scripts/deploy.sh` over SSH: pull, install, build, `pm2 reload`. A human decides when.
- **AI spend is capped by caching.** `gpt-4o-mini` only. Every enrichment cached by `(promptVersion + finding fingerprint)`. After the first demo run, the demo contract's findings are ~100% cache hits. Log estimated tokens per scan; if a projected full demo exceeds the ~$10 credit, [ESCALATE].
- **Gas is bounded.** The only transactions are the one-time identity mint and per-demo proof logs. Budget ~$20 in MNT. Estimate gas live before each proof; if a single proof's gas is materially above expectation, [ESCALATE] before sending.
- **Free tiers, watched.** Supabase free tier, IPFS provider free tier. If demo data volume approaches a free-tier limit, [ESCALATE] - do not silently upgrade to a paid plan.
- **No autoscaling, no managed cron, no per-invocation anything** without explicit human approval.

If any instruction elsewhere in this document appears to conflict with Appendix E, Appendix E wins, and the executor escalates.

## Appendix F - Shared modals, empty states, QA checklist

**Shared modals / states to build (Phase 4).** Same Obsidian system, `MainnetBadge` where relevant, careful copy:
Wallet Connect modal; Generate Proof confirmation modal (locked spec, Phase 3 §3.5); Proof transaction pending state; Proof verified success state; Scan failed state; Empty Reports state; Empty Findings state; Contract Not Verified warning; AI Output Validation error; RPC Rate-limit warning; Export Report modal.

**Global QA checklist - every item must pass before submission:**

- [ ] All ten routes render on desktop and a narrow viewport.
- [ ] Every internal page shows the Mantle Mainnet "Live" badge.
- [ ] No page implies funds movement, trading, RWA allocation, or autonomous strategy.
- [ ] All scan flows are read-only; the only transaction is explicit, user-approved proof logging.
- [ ] Every finding has severity, category, file/line, explanation, confidence, and a next action.
- [ ] Every report has export, share, and proof-logging states.
- [ ] Every table has search/filter and an empty state.
- [ ] Every code panel has copy + fullscreen and readable line numbers.
- [ ] Every chart has labels and human-readable units.
- [ ] The dark Obsidian token set is used everywhere; no stray hardcoded hex.
- [ ] Loading skeletons on every async surface; error states on every fetch.
- [ ] `report_hash` is deterministic and verification re-derives it correctly.
- [ ] No secrets in the repo or the client bundle; pino redaction confirmed.
- [ ] `/api/health` is green; CI is green; the demo contract compiles in CI.
- [ ] The demo script runs start to finish without a dead end.
- [ ] Language is careful throughout - findings, confidence, recommended fix, verifiable proof; never "safe" or "guaranteed".

## Appendix G - What is explicitly NOT built in the MVP

So the executor never drifts into scope that loses the hackathon:

- AI x RWA portfolio / yield allocation - different track, out of scope.
- Autonomous fund movement or trading - out of scope.
- A full VS Code extension - "Open in IDE" is a labeled future affordance only.
- Multi-chain support - Mantle specificity is the moat.
- Full billing / team administration - placeholder settings only if needed.
- A full chain indexer - use RPC + explorer + caching.
- File upload and GitHub repo scan modes - disabled tabs with "Coming soon".

---

## Closing instruction

Keep Archon sharp. It is one thing, executed completely: a Mantle-native, ERC-8004 trustless AI auditor that turns a contract into an observable scan, a credible report, real Foundry tests, honest cost intelligence, and a verifiable, challengeable on-chain proof. Dark, calm, precise. Built like a product, not a demo.

The executor has room to move within every phase. The boundaries are few and they are bright: the seven-stage pipeline, the read-only rule, the single proof transaction, the one-VM budget, the ERC-8004 thesis, the Obsidian design system. Inside those, build well and build freely. Outside them, stop and ask.

*End of handbook. v2.0.*
