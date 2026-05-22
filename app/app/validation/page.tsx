import Link from "next/link";
import { Lock, ShieldAlert } from "lucide-react";

export default function ValidationPreviewPage() {
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-green-400">Validation Preview</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-text-hi">Challenge flow is intentionally read-only</h1>
        <p className="mt-2 max-w-3xl text-text-mid">Archon already logs Identity and Reputation records on Mantle. The ERC-8004 Validation Registry is not configured because no official Mantle Mainnet address has been confirmed.</p>
      </div>
      <span className="rounded-pill border border-warning/30 bg-warning/10 px-3 py-1 text-sm text-warning">Coming soon · no writes</span>
    </header>

    <section className="rounded-card border border-warning/30 bg-warning/10 p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-text-hi"><ShieldAlert className="text-warning"/> Safety invariant</h2>
      <p className="mt-3 max-w-4xl leading-7 text-text-mid">This page does not connect wallets, simulate validation calls, or submit transactions. It documents the future challenge path only. When an official Mantle Validation Registry address and ABI are available, Archon should add static simulation, gas guard, explicit user confirmation, and a dedicated ADR before enabling any write path.</p>
    </section>

    <div className="grid gap-4 lg:grid-cols-3">
      <Step title="1 · Select finding" body="A verifier chooses a report finding and reviews the canonical report hash, finding evidence, generated tests, and IPFS metadata."/>
      <Step title="2 · Build challenge" body="Archon would package a challenge payload that references the report hash and finding ID without mutating the original audit report."/>
      <Step title="3 · Simulate then sign" body="Only after official registry config exists: static call first, gas estimate guard, explicit wallet confirmation, then user-owned transaction." locked/>
    </div>

    <section className="rounded-card border border-border-subtle bg-surface-1 p-5">
      <h2 className="text-xl font-semibold text-text-hi">Current supported verification path</h2>
      <ul className="mt-3 space-y-2 text-sm text-text-mid">
        <li>✓ Public report viewer re-derives deterministic report hashes.</li>
        <li>✓ Proof records link to Mantle Reputation transactions and IPFS metadata.</li>
        <li>✓ ERC-8004 Identity and Reputation addresses are official Mantle Mainnet config.</li>
        <li>✓ Validation challenge writes remain disabled until official config exists.</li>
      </ul>
      <div className="mt-5 flex flex-wrap gap-2"><Link href="/app/proofs" className="rounded-control bg-green-400 px-4 py-2 text-sm font-semibold text-canvas">View proofs</Link><Link href="/app/findings" className="rounded-control border border-border-subtle bg-surface-2 px-4 py-2 text-sm text-text-mid">Review findings</Link></div>
    </section>
  </div>;
}

function Step({ title, body, locked }: { title: string; body: string; locked?: boolean }) {
  return <section className="rounded-card border border-border-subtle bg-surface-1 p-5"><h2 className="flex items-center gap-2 text-lg font-semibold text-text-hi">{locked ? <Lock size={17} className="text-warning"/> : null}{title}</h2><p className="mt-3 text-sm leading-6 text-text-mid">{body}</p></section>;
}
