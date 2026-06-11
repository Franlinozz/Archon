import Link from "next/link";
import { ArrowRight, BadgeCheck, Boxes, CheckCircle2, FileCode2, GitBranch, Layers3, Rocket, ShieldCheck, UploadCloud, Zap, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const launchSteps = [
  { title: "Import", text: "Pull a Solidity file, ZIP, or GitHub repo into Audit Studio with labels preserved." },
  { title: "Analyze", text: "Run Mantle-aware risk, test, gas, and protocol checks before a public launch." },
  { title: "Prove", text: "Attach signed proof records and challenge windows for reviewer-grade credibility." },
  { title: "Ship", text: "Export a launch packet with findings, fixes, proof links, and gas savings." },
];

const templates = [
  { name: "DeFi Vault", tag: "Yield / LP", risk: "Reentrancy, slippage, oracle drift", href: "/app/audit/new?template=vault" },
  { name: "Bridge Adapter", tag: "Cross-chain", risk: "Replay protection, fee accounting", href: "/app/audit/new?template=bridge" },
  { name: "Token Launch", tag: "ERC-20 / sale", risk: "Access control, mint caps, pausing", href: "/app/audit/new?template=token" },
];

const readiness = [
  { label: "Source import", value: "GitHub, ZIP, paste", ok: true },
  { label: "Audit queue", value: "Read-only scans", ok: true },
  { label: "Proof rails", value: "Mantle on-chain", ok: true },
  { label: "Launch packet", value: "Report + tests + gas", ok: true },
];

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-pill border border-border-subtle bg-surface-2 px-3 py-1 text-xs text-text-mid">{children}</span>;
}

function WorkspaceCard({ icon: Icon, title, text, href, cta }: { icon: LucideIcon; title: string; text: string; href: string; cta: string }) {
  return (
    <Link href={href} className="archon-card-lift group rounded-card border border-border-subtle bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-10 place-items-center rounded-control bg-brand-100 text-brand-700"><Icon size={18} /></span>
        <ArrowRight size={16} className="text-text-low transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
      </div>
      <h3 className="mt-5 text-lg font-semibold text-text-hi">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-text-mid">{text}</p>
      <p className="mt-4 text-sm font-semibold text-brand-600">{cta}</p>
    </Link>
  );
}

export default function CreatorWorkspacePage() {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-card border border-border-subtle bg-surface-1 shadow-card">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-8">
          <div>
            <div className="flex flex-wrap gap-2">
              <Pill>Creator Workspace</Pill>
              <Pill>Mantle Mainnet launch desk</Pill>
              <Pill>No placeholder mode</Pill>
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight text-text-hi md:text-5xl">Build, audit, prove, and ship contracts from one Archon cockpit.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-text-mid">
              A founder-grade workspace for protocol teams: import real code, run Archon analysis, package proof-backed reports, and keep launch readiness visible without bouncing across five tools.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/app/audit/new" className="archon-sheen inline-flex items-center gap-2 rounded-control bg-brand-600 px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-700"><UploadCloud size={16} /> Import contract</Link>
              <Link href="/app/reports" className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-2 px-4 py-2.5 text-sm font-semibold text-text-hi hover:border-border-emphasis"><BadgeCheck size={16} /> Open launch packet</Link>
            </div>
          </div>

          <div className="rounded-card border border-success/25 bg-success/10 p-5">
            <div className="flex items-center gap-2 text-success"><ShieldCheck size={18} /><span className="text-sm font-semibold">Workspace readiness</span></div>
            <div className="mt-5 space-y-3">
              {readiness.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface-1/75 px-3 py-2">
                  <div><p className="text-sm font-medium text-text-hi">{item.label}</p><p className="text-xs text-text-low">{item.value}</p></div>
                  <CheckCircle2 size={17} className={item.ok ? "text-success" : "text-text-low"} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <WorkspaceCard icon={FileCode2} title="Start from code" text="Paste Solidity, upload a ZIP, or import GitHub. Archon keeps source labels attached to reports, proofs, and dashboard rows." href="/app/audit/new" cta="Open Audit Studio" />
        <WorkspaceCard icon={Zap} title="Optimize before launch" text="Run gas and DA-cost checks, then turn hot paths into a founder-friendly savings story." href="/app/gas" cta="Open Gas Optimizer" />
        <WorkspaceCard icon={BadgeCheck} title="Prove credibility" text="Publish proof links only after review, with reports, tests, and challenge status ready for investors or judges." href="/app/proofs" cta="Review proofs" />
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-mono text-xs uppercase tracking-[0.16em] text-brand-600">Launch pipeline</p><h2 className="mt-2 text-2xl font-semibold text-text-hi">From contract idea to verifiable packet</h2></div>
            <Rocket className="text-brand-600" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {launchSteps.map((step, index) => (
              <div key={step.title} className="rounded-card border border-border-subtle bg-surface-2 p-4">
                <span className="grid size-7 place-items-center rounded-full bg-brand-600 font-mono text-xs font-semibold text-on-brand">{index + 1}</span>
                <h3 className="mt-4 font-semibold text-text-hi">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-text-mid">{step.text}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-card border border-border-subtle bg-surface-1 p-5">
          <div className="flex items-center gap-2"><Layers3 className="text-brand-600" /><h2 className="text-xl font-semibold text-text-hi">Builder templates</h2></div>
          <div className="mt-4 space-y-3">
            {templates.map((template) => (
              <Link key={template.name} href={template.href} className="block rounded-control border border-border-subtle bg-terminal p-3 hover:border-brand-500/40">
                <div className="flex items-center justify-between gap-3"><p className="font-medium text-text-hi">{template.name}</p><span className="rounded-pill bg-brand-100 px-2 py-0.5 text-xs text-brand-700">{template.tag}</span></div>
                <p className="mt-2 text-xs leading-5 text-text-low">Checks: {template.risk}</p>
              </Link>
            ))}
          </div>
        </aside>
      </section>

      <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-mono text-xs uppercase tracking-[0.16em] text-brand-600">DevTool stack</p><h2 className="mt-2 text-2xl font-semibold text-text-hi">What this replaces for a small protocol team</h2></div>
          <Boxes className="text-brand-600" />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {["Static analyzer + audit tracker", "Gas profiler + launch changelog", "Proof dashboard + reviewer packet"].map((item) => <div key={item} className="rounded-control border border-border-subtle bg-surface-2 px-4 py-3 text-sm text-text-mid"><GitBranch className="mb-2 text-brand-600" size={16} />{item}</div>)}
        </div>
      </section>
    </div>
  );
}
