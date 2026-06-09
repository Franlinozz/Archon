import Link from "next/link";
import { ArrowRight, BadgeCheck, BarChart3, BookOpen, FileCode2, Gauge, GitBranch, LockKeyhole, ShieldCheck, Sparkles, Terminal, Trophy, Zap } from "lucide-react";
import { Reveal } from "@/components/motion";
import { Hero } from "@/components/marketing/Hero";
import { ThreeSteps } from "@/components/marketing/ThreeSteps";

const proofStats = [
  ["7-stage", "Audit pipeline", "Parse, static analysis, Mantle context, protocol rules, gas, AI reasoning, tests."],
  ["ERC-8004", "Reputation-ready", "Reviewed reports can be anchored as verifiable on-chain proof records."],
  ["Mantle", "Cost-aware", "Gas reports split L2 execution from L1/DA cost assumptions for clearer savings."],
] as const;

const platform = [
  { icon: FileCode2, title: "Audit Studio", body: "Paste Solidity, upload a file, import GitHub source, label the run, and generate Mantle-aware findings with regression tests.", href: "/app/audit/new", tag: "Deep scans" },
  { icon: Gauge, title: "Gas Optimizer", body: "Rank safe and review-needed patches, validate suggested changes in a worker, then download optimized source and Foundry proof.", href: "/app/gas", tag: "Patch validation" },
  { icon: BarChart3, title: "Cost Guard", body: "Track recent gas reports, top savings, assumptions, DA split, and leaderboard-ready optimization evidence.", href: "/app/cost-guard", tag: "Operational savings" },
  { icon: BadgeCheck, title: "On-chain Proofs", body: "Prepare canonical report hashes, IPFS metadata, Mantle explorer links, and challengeable evidence trails.", href: "/app/proofs", tag: "Verifiable reports" },
] as const;

const layers = [
  ["Source intelligence", "Verified source, paste uploads, GitHub imports, manual labels, AI-suggested names, compiler-version matching."],
  ["Risk reasoning", "Deterministic findings, Mantle protocol fingerprints, severity-weighted reports, generated tests, assistant explanations."],
  ["Optimization evidence", "Gas opportunity ranking, safe patch validation, Foundry compile checks, downloadable patches, public leaderboard filters."],
  ["Trust surface", "Canonical hashes, proof metadata, challenge panels, API reference, public reports, and whitepaper-backed positioning."],
] as const;

const features = ["Manual + AI-suggested contract labels", "Docs and public API reference", "Whitepaper + downloadable PDF", "Challenge ledger for reports and optimizations", "Exact Solidity 0.8.24 compiler support", "Mantle-only network safety gates", "Live dashboard sidebar taxonomy", "Sample rows clearly labeled"];

export default function MarketingHome() {
  return <main className="overflow-hidden text-text-hi">
    <Hero />

    <section className="mx-auto max-w-7xl px-6 pb-8">
      <div className="grid gap-4 md:grid-cols-3">
        {proofStats.map(([value, label, body]) => <Reveal key={label}><article className="h-full rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card">
          <p className="font-mono text-3xl text-green-400">{value}</p>
          <h2 className="mt-3 text-lg font-semibold text-text-hi">{label}</h2>
          <p className="mt-2 text-sm leading-6 text-text-mid">{body}</p>
        </article></Reveal>)}
      </div>
    </section>

    <section id="product" className="mx-auto max-w-7xl px-6 py-12">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
        <Reveal><div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-green-400">Standard build · premium audit ops</p>
          <h2 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-text-hi md:text-5xl">One workspace for contract risk, gas savings, and verifiable proof.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-text-mid">Archon should feel like the professional control room a protocol team opens before shipping on Mantle: clear scan naming, useful economics, explainable findings, and proof trails that can stand up to review.</p>
        </div></Reveal>
        <Reveal><div className="rounded-card border border-green-400/20 bg-green-400/[0.04] p-5">
          <div className="flex items-center gap-3"><Sparkles className="text-green-400" /><p className="font-semibold text-text-hi">Built for serious dev workflows</p></div>
          <p className="mt-3 text-sm leading-6 text-text-mid">Label each scan like a real project, validate changes before downloading, filter public gas results intentionally, and move from discovery → action → proof without losing context.</p>
        </div></Reveal>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {platform.map((item) => { const Icon = item.icon; return <Reveal key={item.title}><Link href={item.href} className="group block h-full rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card transition hover:-translate-y-0.5 hover:border-green-400/40 hover:shadow-lift">
          <div className="flex items-center justify-between gap-3"><span className="rounded-control border border-green-400/25 bg-green-400/10 p-2 text-green-400"><Icon size={18}/></span><span className="rounded-pill border border-border-subtle bg-surface-2 px-2 py-1 text-[11px] text-text-low">{item.tag}</span></div>
          <h3 className="mt-5 text-xl font-semibold text-text-hi">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-text-mid">{item.body}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-green-400">Open surface <ArrowRight size={14} className="transition group-hover:translate-x-0.5" /></span>
        </Link></Reveal>; })}
      </div>
    </section>

    <section className="relative border-y border-border-subtle bg-surface-1/70">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,197,94,0.16),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.07),transparent_30%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-8 px-6 py-14 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <Reveal><div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-green-400">How Archon thinks</p>
          <h2 className="mt-3 text-4xl font-bold tracking-tight text-text-hi">From unknown source to reviewed evidence.</h2>
          <p className="mt-4 text-sm leading-7 text-text-mid">The platform is organized around the same path a protocol team follows: understand the code, act on risk, optimize costs, then prove and govern the outcome.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/docs" className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-4 py-2.5 text-sm text-text-mid hover:text-green-400"><BookOpen size={16}/> Read docs</Link>
            <Link href="/docs/resources/whitepaper" className="inline-flex items-center gap-2 rounded-control bg-green-500 px-4 py-2.5 text-sm font-semibold text-on-green hover:bg-green-400">Whitepaper <ArrowRight size={16}/></Link>
          </div>
        </div></Reveal>
        <div className="grid gap-3">
          {layers.map(([title, body], index) => <Reveal key={title}><article className="flex gap-4 rounded-card border border-border-subtle bg-terminal p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-green-400/30 bg-green-400/10 font-mono text-sm text-green-400">{index + 1}</span>
            <div><h3 className="font-semibold text-text-hi">{title}</h3><p className="mt-1 text-sm leading-6 text-text-mid">{body}</p></div>
          </article></Reveal>)}
        </div>
      </div>
    </section>

    <ThreeSteps />

    <section className="mx-auto max-w-7xl px-6 py-14">
      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <Reveal><div className="rounded-card border border-border-subtle bg-surface-1 p-6 shadow-card">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-green-400">Dashboard language</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-hi">Command. Analysis. Attestation. Control.</h2>
          <p className="mt-3 text-sm leading-7 text-text-mid">The app navigation now feels native to Archon: workspace intelligence first, audit and optimization work next, proof surfaces after that, and operator controls kept separate.</p>
          <div className="mt-5 grid gap-2 text-sm text-text-mid sm:grid-cols-2">
            {["Command → Overview, context, reports", "Analysis → Audit, findings, tests, gas", "Attestation → Proofs, validation", "Control → Settings"].map((item) => <div key={item} className="rounded-control border border-border-subtle bg-terminal px-3 py-2">{item}</div>)}
          </div>
        </div></Reveal>
        <Reveal><div className="rounded-card border border-green-400/20 bg-green-400/[0.04] p-6 shadow-card">
          <div className="flex items-center gap-3"><Trophy className="text-green-400"/><h2 className="text-2xl font-semibold text-text-hi">Recent platform upgrades</h2></div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {features.map((feature) => <div key={feature} className="flex gap-2 rounded-control border border-border-subtle bg-surface-1 px-3 py-2 text-sm text-text-mid"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-green-400"/>{feature}</div>)}
          </div>
        </div></Reveal>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-6 pb-14">
      <div className="rounded-card border border-border-subtle bg-terminal p-6 shadow-lift">
        <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-green-400">Production posture</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-hi">Read-only by default. Evidence-first when it matters.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-text-mid">Archon does not move funds during scans, does not silently mutate source, and does not present synthetic samples as production truth. It prepares reviewed artifacts that teams can inspect, challenge, download, and anchor.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Mini icon={<LockKeyhole size={16}/>} label="Read-only scans" />
            <Mini icon={<Terminal size={16}/>} label="Compile-gated patches" />
            <Mini icon={<GitBranch size={16}/>} label="Source import paths" />
            <Mini icon={<Zap size={16}/>} label="Mantle cost model" />
          </div>
        </div>
      </div>
    </section>

    <footer id="docs" className="mx-auto grid max-w-7xl gap-6 border-t border-border-subtle px-6 py-8 text-sm text-text-mid md:grid-cols-4">
      <Footer title="Product" items={[["Audit Studio", "/app/audit/new"], ["Gas Optimizer", "/app/gas"], ["Cost Guard", "/app/cost-guard"], ["Proofs", "/proofs"]]}/>
      <Footer title="Resources" items={[["Docs", "/docs"], ["Whitepaper", "/docs/resources/whitepaper"], ["PDF", "/docs/archon-whitepaper.pdf"], ["API Reference", "/api-reference"]]}/>
      <Footer title="Trust" items={[["Mantle-native"], ["Read-only scans"], ["Challengeable reports"], ["No fake leaderboard rows"]]}/>
      <Footer title="Connect" items={[["GitHub", "https://github.com/Franlinozz/Archon"], ["Mantle Explorer", "https://mantlescan.xyz"], ["ERC-8004", "https://eips.ethereum.org/EIPS/eip-8004"], ["Archon Agent", "/.well-known/archon-agent.json"]]}/>
    </footer>
  </main>;
}

function Mini({ icon, label }: { icon: React.ReactNode; label: string }) { return <div className="flex items-center gap-2 rounded-control border border-border-subtle bg-surface-1 px-3 py-3 text-sm text-text-mid"><span className="text-green-400">{icon}</span>{label}</div>; }
function Footer({ title, items }: { title: string; items: Array<[string, string?]> }) {
  return <div><h3 className="text-sm font-semibold text-text-hi">{title}</h3><ul className="mt-3 space-y-2 text-text-mid">{items.map(([label, href]) => <li key={label}>{!href ? <span className="text-text-low">{label}</span> : href.startsWith("http") ? <a href={href} target="_blank" rel="noreferrer" className="transition-colors hover:text-text-hi">{label}</a> : <Link href={href} className="transition-colors hover:text-text-hi">{label}</Link>}</li>)}</ul></div>;
}
