# Archon — 5-minute judge walkthrough

**Track:** Mantle AI Hackathon · DevTools
**Live:** https://archonaudit.xyz · **Public report:** https://archonaudit.xyz/r/5ec46389-918a-4c90-858a-c14da0667a46

One-line pitch: *Archon is an ERC-8004 trustless smart-contract auditor on Mantle Mainnet — it runs a seven-stage read-only analysis, generates Foundry tests, and logs a verifiable, challengeable proof of every report on-chain.*

---

### 0 · Landing (0:00–0:30)
- Open https://archonaudit.xyz. One clean header, dense "Obsidian" operator console.
- Read the thesis: an audit should be a **verifiable object**, not a static PDF.
- Click **Start Mainnet Audit**.

### 1 · Audit Studio → run a scan (0:30–1:15)
- Paste a flawed contract (or use a `contracts/fixtures` sample). Pick a depth + protocol targets.
- Click **Run Archon Scan**. Note: scanning is **read-only** — no wallet, no writes.

### 2 · Live pipeline (1:15–2:00)
- Watch the seven stages advance (active stage pulses, completed checks pop in).
- Findings **stream in live** over SSE; the progress bar eases to 100%.

### 3 · Report → finding detail (2:00–2:45)
- Open the assembled report: risk score, severity split, findings table (with search + empty state).
- Open a critical finding: line-level code evidence, why it matters on Mantle, recommended fix, suggested patch/diff.

### 4 · Generated tests (2:45–3:15)
- Open **Generated Tests**: a real Foundry file with a **Mantle-fork `setUp()`** (`vm.createSelectFork`, chain 5000), test matrix, and coverage-by-finding. **Copy All** / **Export** both work.

### 5 · Generate proof (3:15–4:00)
- On the report, click **Generate Proof**. Connect a wallet (RainbowKit, Mantle-only — wrong network shows a "Switch to Mantle" guard).
- Review the deterministic report hash + metadata URI, simulation/gas check, then **Sign & Log**. The Reputation entry is submitted by Archon's dedicated server-side client wallet.

### 6 · Verify on Proofs (4:00–4:30)
- Open **On-chain Proof**: re-derived hash **matches** the stored hash; Mantlescan tx + IPFS metadata links.
- Open the **public report** `/r/[reportId]` in a fresh tab — no wallet needed; anyone can re-check.

### 7 · Assistant + Cost Guard (4:30–5:00)
- Ask the **Archon Assistant** about the open finding — it answers with page context (gpt-4o-mini). It never starts scans or sends transactions.
- Glance at **Cost Guard** (clearly "Sample data") — the one-VM cost-discipline story.
- Close on the ERC-8004 thesis: Archon turns audit work into a portable, verifiable, challengeable on-chain reputation trail.

---

### On-chain evidence (for verification)
- Identity NFT (agent 97) owner: `0xBd88eAE165F8A00B1B33357Fb0880CD4fE5C5E70`
- Identity Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Reputation Registry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
- Example proof tx: `0xfe5a2b6bc9e311227ea54eaad2fc2ce46a32bdea2ff7808528108d61569099cb`
- IPFS metadata: `ipfs://QmVqmvKfb3M3jP8EmK5jan87XvuMF1zjqkrxgDhcrrKXig`
