import type { Metadata } from "next";
import Link from "next/link";
import { isAddress } from "viem";
import { ArrowUpRight, BadgeCheck, FileSearch, Gauge, Radar, ShieldAlert } from "lucide-react";
import { getAddressProfile } from "@/lib/address/profile";
import { CopyButton } from "@/components/archon";
import { MANTLE_EXPLORER_URL, explorerTxUrl } from "@/lib/chain/mantle";

export const revalidate = 300;

const short = (v: string) => `${v.slice(0, 8)}…${v.slice(-6)}`;
const FRESH: Record<string, string> = { fresh: "border-success/30 bg-success/10 text-success", aging: "border-warning/30 bg-warning/10 text-warning", attention: "border-high/40 bg-warning/10 text-high", stale: "border-danger/30 bg-danger-bg text-danger", unaudited: "border-border-subtle bg-surface-2 text-text-low" };

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) return { title: "Address — Archon" };
  const p = await getAddressProfile(address).catch(() => null);
  const title = p?.known ? `${p.contractName ?? short(address)} — risk ${p.latestRisk ?? "—"} · Archon` : `${short(address)} — Archon security profile`;
  const description = p?.known
    ? `Archon security profile for ${p.contractName ?? address} on Mantle: risk ${p.latestRisk ?? "—"}, ${p.reports.length} report(s), attestation ${p.attestation?.matchType ?? "none"}, freshness ${p.freshness.level}.`
    : `No Archon analysis yet for ${address} on Mantle. Run the first scan.`;
  return { title, description, openGraph: { title, description, url: `https://archonaudit.xyz/address/${address}`, images: [{ url: "/hero-dark.png", width: 2172, height: 724 }] }, twitter: { card: "summary_large_image", title, description } };
}

export default async function AddressPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) return <main className="mx-auto max-w-3xl px-6 py-20 text-center text-text-mid">Not a valid address.</main>;
  const p = await getAddressProfile(address);
  const explorer = `${MANTLE_EXPLORER_URL}/address/${address}`;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-text-hi">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-500">Address intelligence · Mantle Mainnet</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-[-0.03em] text-ink">{p?.contractName ?? short(address)}</h1>
          <p className="mt-1 inline-flex items-center gap-2 font-mono text-sm text-text-mid">{short(address)} <CopyButton value={address} /> <a href={explorer} target="_blank" rel="noreferrer" className="text-brand-500 hover:text-brand-600"><ArrowUpRight size={13} /></a></p>
        </div>
        {p?.known && p.latestRisk != null ? (
          <div className="rounded-card border border-warning/30 bg-warning/10 px-5 py-3 text-center"><p className="text-[11px] uppercase tracking-[0.12em] text-warning">Risk</p><p className="font-mono text-3xl text-ink">{p.latestRisk}</p></div>
        ) : null}
      </div>

      {!p?.known ? (
        <div className="mt-10 rounded-card border border-border-subtle bg-surface-1 p-10 text-center shadow-card">
          <FileSearch className="mx-auto text-text-low" size={28} />
          <p className="mt-3 text-lg font-semibold text-ink">No Archon analysis yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-mid">This Mantle contract hasn&apos;t been scanned, attested, or monitored by Archon. Be the first.</p>
          <Link href="/app/audit/new" className="mt-5 inline-block rounded-control bg-green-400 px-5 py-2.5 text-sm font-semibold text-on-green hover:bg-green-300">Run the first Archon scan</Link>
        </div>
      ) : (
        <>
          {/* Status chips */}
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <span className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 ${FRESH[p.freshness.level] ?? FRESH.unaudited}`} title={p.freshness.reason}><Radar size={13} /> {p.freshness.level}</span>
            {p.attestation ? <Link href={`/attest/${p.attestation.attestationId}`} className="inline-flex items-center gap-1.5 rounded-pill border border-success/30 bg-success/10 px-3 py-1 text-success"><BadgeCheck size={13} /> attested · {p.attestation.matchType}</Link> : <span className="inline-flex items-center gap-1.5 rounded-pill border border-border-subtle bg-surface-2 px-3 py-1 text-text-low"><BadgeCheck size={13} /> not attested</span>}
            {p.monitored ? <span className="inline-flex items-center gap-1.5 rounded-pill border border-brand-500/30 bg-brand-50 px-3 py-1 text-brand-600"><Radar size={13} /> Sentinel-monitored</span> : null}
            {p.openCritical + p.openHigh > 0 ? <span className="inline-flex items-center gap-1.5 rounded-pill border border-danger/30 bg-danger-bg px-3 py-1 text-danger"><ShieldAlert size={13} /> {p.openCritical} critical · {p.openHigh} high</span> : null}
          </div>

          {/* Reports timeline */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-ink">Audit timeline</h2>
            {p.reports.length === 0 ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface-1 p-4 text-sm text-text-mid shadow-card">
                <span>No Archon audit report yet for this address{p.attestation ? " — build-attested only" : ""}.</span>
                <Link href="/app/audit/new" className="rounded-control bg-green-400/10 px-3 py-1.5 font-semibold text-green-400 hover:bg-green-400/20">Run a scan</Link>
              </div>
            ) : null}
            <ol className="mt-3 space-y-2">
              {p.reports.map((r) => (
                <li key={r.reportId} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface-1 p-4 shadow-card">
                  <div>
                    <p className="text-sm text-text-mid">{new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC</p>
                    <p className="font-mono text-sm text-text-hi">risk {r.riskScore}/100 {r.anchored ? <span className="text-success">· proof ⚓</span> : null}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {r.proofTx ? <a href={explorerTxUrl(r.proofTx)} target="_blank" rel="noreferrer" className="text-text-mid hover:text-text-hi">proof tx ↗</a> : null}
                    <Link href={`/r/${r.reportId}`} className="rounded-control bg-green-400/10 px-3 py-1.5 font-semibold text-green-400 hover:bg-green-400/20">View report</Link>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Gas + badge */}
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {p.gas ? (
              <section className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Gauge size={15} /> Gas profile</p>
                <p className="mt-2 font-mono text-xs text-text-mid">L2 {p.gas.l2WeiPerCall ?? "—"} wei · DA {p.gas.daWeiPerCall ?? "—"} wei / call (receipt-calibrated)</p>
                <Link href={`/app/gas/${p.gas.gasReportId}`} className="mt-2 inline-block text-sm text-brand-500 hover:text-brand-600">Open gas report →</Link>
              </section>
            ) : null}
            <section className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card">
              <p className="text-sm font-semibold text-ink">Embed this badge</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- dynamic SVG badge route, not an optimizable asset */}
              <img src={`/badge/${address}.svg`} alt="Archon badge" className="mt-2 h-5" />
              <pre className="mt-2 overflow-x-auto rounded-control border border-border-subtle bg-terminal p-2 font-mono text-[11px] text-text-code">{`[![Archon](https://archonaudit.xyz/badge/${address}.svg)](https://archonaudit.xyz/address/${address})`}</pre>
            </section>
          </div>

          {/* Challenges */}
          {p.challenges.length ? (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-ink">Challenges</h2>
              <ul className="mt-3 space-y-2">{p.challenges.map((c) => <li key={c.id} className="rounded-control border border-border-subtle bg-surface-1 px-4 py-2 text-sm text-text-mid"><span className="text-text-hi">{c.title}</span> · {c.status}</li>)}</ul>
            </section>
          ) : null}

          <p className="mt-8 text-xs text-muted">Archon risk intelligence with provenance — not a safety guarantee. Verify proofs independently. <Link href="/docs/platform-api/public-pages-badges" className="text-brand-500 hover:text-brand-600">About public pages & badges →</Link></p>
        </>
      )}
    </main>
  );
}
