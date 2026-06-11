import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CopyButton } from "@/components/archon";
import { Reveal } from "@/components/motion";
import { explorerTxUrl } from "@/lib/chain/mantle";
import { shortHash, type LandingProof } from "@/lib/marketing/stats";

// Show, don't claim: the latest REAL anchored report rendered as a terminal
// receipt, with independent verification one click away. Hidden entirely if no
// anchored proof exists — never a mocked receipt.
export function ProofReceipt({ proof }: { proof: LandingProof | null }) {
  if (!proof) return null;
  const logged = proof.loggedAt
    ? new Date(proof.loggedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
    : null;

  return (
    <section className="mx-auto max-w-7xl px-6 py-20 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-500">Proof, shown</p>
          <h2 className="mt-3 font-display text-4xl tracking-[-0.03em] text-ink md:text-5xl">Don&apos;t trust the report. Verify it.</h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-body">
            This is Archon&apos;s most recent anchored report, pulled live from the registry — re-check the hash and transaction yourself, no wallet required.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/r/${proof.reportId}`} className="rounded-control bg-green-400 px-4 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-300">Verify independently</Link>
            <a href={explorerTxUrl(proof.txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-control border border-border-subtle px-4 py-2.5 text-sm text-body transition-colors hover:border-border-emphasis hover:text-ink">View transaction <ArrowUpRight size={14} aria-hidden /></a>
          </div>
        </Reveal>

        <Reveal>
          <div className="rounded-card border border-border-subtle bg-terminal p-6 font-mono text-sm shadow-lift">
            <div className="flex items-center justify-between gap-3 border-b border-border-subtle pb-4">
              <span className="text-xs uppercase tracking-[0.18em] text-muted">Archon proof receipt</span>
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success"><span className="size-1.5 rounded-full bg-success" /> Anchored</span>
            </div>
            <dl className="mt-4 space-y-3 text-[13px]">
              <ReceiptRow label="contract" value={<span className="text-text-code">{proof.contractName}</span>} />
              <ReceiptRow label="risk score" value={<span className="text-text-code">{proof.riskScore}/100</span>} />
              <ReceiptRow label="report hash" value={<span className="inline-flex items-center gap-1.5 text-text-code">{shortHash(proof.reportHash)} <CopyButton value={proof.reportHash} /></span>} />
              <ReceiptRow label="anchor tx" value={<span className="inline-flex items-center gap-1.5 text-text-code">{shortHash(proof.txHash)} <CopyButton value={proof.txHash} /></span>} />
              <ReceiptRow label="agent" value={<span className="text-text-code">ERC-8004 #97</span>} />
              <ReceiptRow label="network" value={<span className="text-text-code">Mantle Mainnet · 5000</span>} />
              {logged ? <ReceiptRow label="logged" value={<span className="text-text-code">{logged}</span>} /> : null}
            </dl>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ReceiptRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}
