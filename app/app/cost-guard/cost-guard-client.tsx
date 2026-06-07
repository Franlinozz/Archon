"use client";

import Link from "next/link";
import { ArrowRight, FileSearch, ShieldAlert, Zap } from "lucide-react";

export function CostGuardClient() {
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-green-400">Cost Guard</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Mantle gas intelligence is now report-native.</h1>
        <p className="mt-2 max-w-3xl text-text-mid">Archon no longer shows sample spend charts here. Run a real scan, open the report, and use the Gas Optimizer section for measured creation bytecode size, live Mantle GasPriceOracle deploy data-fee pricing, and source-level optimization findings.</p>
      </div>
      <span className="rounded-pill border border-success/30 bg-success/10 px-3 py-1 text-xs uppercase tracking-[0.12em] text-success">No mock telemetry</span>
    </header>

    <section className="grid gap-4 md:grid-cols-3">
      <Card icon={<FileSearch className="text-green-400" />} title="1 · Scan real source" body="Paste, upload, import from GitHub, or scan a verified Mantle address. The worker compiles the Solidity before any gas profile is attached." />
      <Card icon={<Zap className="text-green-400" />} title="2 · Price with Mantle" body="Archon calls the documented GasPriceOracle getL1Fee(bytes) at 0x4200…000F against compiled creation bytecode." />
      <Card icon={<ShieldAlert className="text-green-400" />} title="3 · Review no-tx advice" body="Optimization output is advisory and read-only. Proof logging remains the only explicit user-approved write path." />
    </section>

    <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
      <h2 className="text-xl font-semibold text-text-hi">Open a real gas report</h2>
      <p className="mt-2 text-sm leading-6 text-text-mid">The previous Cost Guard dashboard used curated sample charts. To keep Archon honest for V2, those visuals were removed until they can be backed by persisted telemetry. The working path today is the report-level Gas Optimizer.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/app/audit/new" className="inline-flex items-center gap-2 rounded-control bg-green-400 px-4 py-2 font-semibold text-canvas">Run a Scan <ArrowRight size={16}/></Link>
        <Link href="/app/reports" className="inline-flex items-center gap-2 rounded-control border border-border-subtle bg-terminal px-4 py-2 text-text-mid hover:text-green-400">View Reports</Link>
      </div>
    </section>
  </div>;
}

function Card({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><div className="mb-3">{icon}</div><h2 className="text-lg font-semibold text-text-hi">{title}</h2><p className="mt-2 text-sm leading-6 text-text-mid">{body}</p></section>;
}
