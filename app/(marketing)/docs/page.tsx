import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Archon Docs",
  description: "How Archon works: the seven-stage read-only audit pipeline, the read-only safety model, ERC-8004 on Mantle, and how anyone can verify a proof.",
};

const nav = [
  ["What is Archon", "overview"],
  ["How it works", "how-it-works"],
  ["Read-only safety model", "safety"],
  ["ERC-8004 on Mantle", "erc8004"],
  ["Run a scan", "run-a-scan"],
  ["Proofs & verification", "proofs"],
  ["Architecture", "architecture"],
  ["FAQ", "faq"],
] as const;

const stages = [
  ["Code Parse", "Normalise pasted Solidity or fetch verified source for a Mantle address; extract contracts, functions, and pragmas."],
  ["Static Analysis", "Run Slither + solc/solcjs detectors deterministically (reentrancy, low-level calls, unbounded loops, …)."],
  ["Mantle Context Fetch", "Read-only RPC reads: bytecode, balances, verified-source status, known protocol interactions."],
  ["Protocol Rule Engine", "Apply Mantle-specific rules (sequencer/timestamp assumptions, origin auth, L1-data-fee gas patterns, slippage)."],
  ["AI Reasoning", "Optional gpt-4o-mini enrichment of findings with schema validation; deterministic fallback when no key is set."],
  ["Test Generation", "Emit a Foundry regression test with a real Mantle-fork setUp mapped back to findings."],
  ["Report Assembly", "Compute risk score + severity split, persist findings, and derive the deterministic report hash."],
] as const;

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-7xl gap-10 px-6 py-10 lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <nav className="sticky top-20 space-y-1 text-sm">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-green-400">Documentation</p>
          {nav.map(([label, id]) => (
            <a key={id} href={`#${id}`} className="block rounded-control px-3 py-1.5 text-text-mid transition-colors hover:bg-surface-2 hover:text-green-400">{label}</a>
          ))}
        </nav>
      </aside>

      <article className="min-w-0 space-y-12">
        <header>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-green-400">Docs</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Archon documentation</h1>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-text-mid">An ERC-8004 trustless smart-contract auditor native to Mantle Mainnet. Read-only analysis, verifiable proofs, challengeable reports.</p>
        </header>

        <Section id="overview" title="What is Archon">
          <p>Archon ingests verified or pasted Solidity, runs a seven-stage <strong className="text-text-hi">read-only</strong> analysis pipeline, produces an audit report with findings and generated Foundry tests, and — only on explicit user approval — logs a verifiable proof of that report to Mantle Mainnet via ERC-8004 Identity + Reputation.</p>
          <p className="mt-3">The thesis: an audit should be a <strong className="text-text-hi">verifiable object</strong>, not a static PDF or a private dashboard. Every Archon report yields a deterministic hash, IPFS metadata, and an on-chain Reputation entry that anyone can independently re-check — and, in principle, challenge. Trust the reproducible evidence, not only the auditor’s claim.</p>
          <Callout>Archon produces risk intelligence with confidence scores and recommended fixes. It is not a guarantee, certification, or claim that a contract is safe.</Callout>
        </Section>

        <Section id="how-it-works" title="How it works — the seven-stage pipeline">
          <p>Each scan streams through seven stages over Server-Sent Events; findings appear live as they are persisted.</p>
          <ol className="mt-4 space-y-2">
            {stages.map(([name, body], i) => (
              <li key={name} className="flex gap-3 rounded-card border border-border-subtle bg-surface-1 p-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-green-400/30 font-mono text-xs text-green-400">{i + 1}</span>
                <span><span className="font-semibold text-text-hi">{name}</span> — <span className="text-text-mid">{body}</span></span>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="safety" title="Read-only safety model">
          <ul className="space-y-2">
            <Li>The entire scan pipeline is <strong className="text-text-hi">read-only</strong> — it never writes to the audited contract or to chain state.</Li>
            <Li>The <strong className="text-text-hi">only</strong> intended transaction is the user-approved proof log, and it targets the ERC-8004 Reputation registry — never the audited contract.</Li>
            <Li>Proof writes are simulated and gas-checked first; an unexpectedly high estimate stops and asks for human confirmation.</Li>
            <Li>The proof transaction is submitted by Archon’s dedicated server-side, non-owner client wallet (to satisfy ERC-8004 self-feedback rules); your connected wallet provides ownership context and the Mantle network guard only.</Li>
            <Li>The Archon Assistant explains context and findings; it never starts scans, connects wallets, or sends transactions.</Li>
            <Li>Secrets live only in environment variables and are never committed. AI output is validated against a schema before storage/display.</Li>
          </ul>
        </Section>

        <Section id="erc8004" title="ERC-8004 on Mantle">
          <p>Archon uses the official ERC-8004 contract ABIs and the official Mantle Mainnet registries. Validation Registry support is intentionally out of scope until an official Mantle Mainnet Validation Registry address is published.</p>
          <dl className="mt-4 grid gap-2 rounded-card border border-border-subtle bg-terminal p-4 font-mono text-sm">
            <KV k="Chain" v="Mantle Mainnet · 5000" />
            <KV k="Identity Registry" v="0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" />
            <KV k="Reputation Registry" v="0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" />
            <KV k="Validation Registry" v="Disabled — no official Mantle address published" />
            <KV k="Archon Agent ID" v="97" />
            <KV k="Identity ref" v="eip155:5000:0x8004A169…a432:97" />
          </dl>
          <p className="mt-3">The agent metadata is served at <a className="text-green-400 hover:text-green-300" href="/.well-known/archon-agent.json">/.well-known/archon-agent.json</a>, which is also the on-chain <code className="font-mono text-text-code">tokenURI</code> of Archon’s identity NFT.</p>
        </Section>

        <Section id="run-a-scan" title="Run a scan">
          <ol className="space-y-2">
            <Li>Open <Link className="text-green-400 hover:text-green-300" href="/app/audit/new">Audit Studio</Link> and paste Solidity (or enter a verified Mantle address).</Li>
            <Li>Pick a scan depth and the protocol-coverage targets, then run the scan.</Li>
            <Li>Watch the live pipeline: stages advance and findings stream in as they’re persisted.</Li>
            <Li>Open the assembled report for the risk score, severity split, line-level evidence, recommended fixes, and generated Foundry tests.</Li>
          </ol>
        </Section>

        <Section id="proofs" title="Proofs & verification">
          <p>A proof turns a report into something anyone can independently check:</p>
          <ul className="mt-3 space-y-2">
            <Li><strong className="text-text-hi">Deterministic hash</strong> — canonical report metadata is hashed reproducibly.</Li>
            <Li><strong className="text-text-hi">IPFS metadata</strong> — the canonical metadata is pinned; the URI is recorded on-chain.</Li>
            <Li><strong className="text-text-hi">ERC-8004 Reputation entry</strong> — a feedback entry for Archon’s agent records the hash + metadata URI on Mantle Mainnet.</Li>
          </ul>
          <p className="mt-3">To verify any report yourself: re-derive the hash from the IPFS metadata and confirm it equals the on-chain <code className="font-mono text-text-code">feedbackHash</code>, and confirm the Reputation entry exists for the agent. The <Link className="text-green-400 hover:text-green-300" href="/app/proofs">Proofs dashboard</Link> shows the hash match, Mantlescan tx, and IPFS reference; the public viewer at <code className="font-mono text-text-code">/r/[reportId]</code> needs no wallet.</p>
          <Callout>Example verified report: <Link className="text-green-400 hover:text-green-300" href="/r/5ec46389-918a-4c90-858a-c14da0667a46">/r/5ec46389-918a-4c90-858a-c14da0667a46</Link></Callout>
        </Section>

        <Section id="architecture" title="Architecture">
          <p>Archon is intentionally simple and cost-controlled: Next.js 15 App Router, PM2 + Caddy on one VM, BullMQ + local Redis for scan jobs and live events, Supabase Postgres for data, Slither/solc for deterministic analysis, optional gpt-4o-mini enrichment, Pinata/IPFS for metadata, and Mantle + ERC-8004 for proofs.</p>
          <div className="mt-4 overflow-x-auto rounded-card border border-border-subtle bg-surface-1 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/archon-architecture.svg" alt="Archon system architecture diagram" className="mx-auto w-full max-w-3xl" />
          </div>
        </Section>

        <Section id="faq" title="FAQ">
          <Faq q="Does Archon change my contract?" a="No. Scanning is entirely read-only. The only transaction is the user-approved proof log, which targets the ERC-8004 Reputation registry, never your contract." />
          <Faq q="Is a clean report a guarantee of safety?" a="No. Reports are risk intelligence with confidence scores, not certifications. Always pair them with human review and the generated tests." />
          <Faq q="Do I need a wallet to read a report?" a="No. The public viewer at /r/[reportId] requires no wallet. A wallet is only used for ownership context and the Mantle network guard when logging a proof." />
          <Faq q="Why is the Validation Registry disabled?" a="The official ERC-8004 README publishes no Mantle Mainnet Validation Registry address, so Archon keeps Identity + Reputation only rather than pointing at an unverified address." />
          <Faq q="What happens without an OpenAI key?" a="Archon stays usable: findings come from deterministic Slither + Mantle rules, and the assistant/enrichment fall back to deterministic responses." />
        </Section>
      </article>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold text-text-hi">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-text-mid">{children}</div>
    </section>
  );
}
function Li({ children }: { children: React.ReactNode }) {
  return <li className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-green-400" /><span>{children}</span></li>;
}
function KV({ k, v }: { k: string; v: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-text-low">{k}</span><span className="break-all text-text-hi">{v}</span></div>;
}
function Callout({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">{children}</p>;
}
function Faq({ q, a }: { q: string; a: string }) {
  return <div className="mt-3 rounded-card border border-border-subtle bg-surface-1 p-4"><p className="font-semibold text-text-hi">{q}</p><p className="mt-1.5 text-sm text-text-mid">{a}</p></div>;
}
