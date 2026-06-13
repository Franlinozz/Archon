import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getObservatory } from "@/lib/observatory/stats";
import { explorerTx } from "@/lib/observatory/sampler";
import { OracleChart } from "@/components/observatory/OracleChart";
import { Reveal } from "@/components/motion";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Mantle Gas Observatory — Archon",
  description: "The receipt-calibrated source of truth on Mantle's data-availability economics: real DA cost per byte, L2 base fee, and the legacy oracle's divergence from charged fees.",
};

const fmtGwei = (g: number | null) => (g == null ? "—" : g < 0.001 ? g.toExponential(2) : g.toLocaleString("en-US", { maximumFractionDigits: 4 }));
const fmtMnt = (m: number) => (m < 0.000001 ? m.toExponential(2) : m.toFixed(9).replace(/0+$/, "").replace(/\.$/, ""));

export default async function ObservatoryPage() {
  const o = await getObservatory().catch(() => null);
  const warming = !o || (o.current.sampleCount24h === 0 && !o.calibration);
  const divergence = o?.oracle.live ?? (o ? { underReportPct: Number(o.oracle.anchors[0]?.underReportPct.replace("%", "") ?? 99.96), sampleCount: o.oracle.anchors.length, source: "anchor" as const } : null);

  return (
    <main className="mx-auto max-w-7xl px-6 py-16 text-text-hi md:py-20">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-500">Mantle Gas Observatory · receipt-calibrated</p>
        <h1 className="mt-3 max-w-3xl font-display text-5xl tracking-[-0.04em] text-ink md:text-6xl">Mantle&apos;s data-availability economics, from receipts.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-body md:text-lg">Every number here is derived from real Mantle transaction receipts (<span className="font-mono text-sm text-text-code">l1Fee</span>), not the legacy oracle. Sample sizes are always shown. <Link href="/observatory/methodology" className="text-brand-500 hover:text-brand-600">Methodology →</Link></p>
      </Reveal>

      {warming ? (
        <div className="mt-10 rounded-card border border-border-subtle bg-surface-1 p-8 text-center text-text-mid">The Observatory sampler is warming up — receipt samples are being collected from recent Mantle blocks. Check back shortly.</div>
      ) : (
        <>
          {/* Headline divergence */}
          <Reveal className="mt-10">
            <div className="rounded-card border border-warning/30 bg-warning/5 p-6 md:p-8">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-warning">Legacy oracle divergence</p>
              <p className="mt-2 font-display text-5xl tracking-[-0.03em] text-ink md:text-6xl">{divergence?.underReportPct.toFixed(2)}%</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-body">The legacy <span className="font-mono text-xs">GasPriceOracle.getL1Fee</span> under-reports the DA fee Mantle actually charges by this much — measured across {divergence?.sampleCount} {divergence?.source === "live" ? "live receipt samples" : "verified reference transactions (ADR 0007)"}. Tools quoting the oracle are invisibly wrong about Mantle DA cost.</p>
            </div>
          </Reveal>

          {/* Current network */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Stat label="DA cost / calldata byte" value={`${fmtGwei(o.current.daPerByteGwei)} gwei`} sub={`median · ${o.current.sampleCount24h} samples / 24h`} />
            <Stat label="L2 base fee" value={`${fmtGwei(o.current.l2BaseFeeGwei)} gwei`} sub="median of recent blocks" />
            <Stat label="Calibration error" value={o.calibration ? `${o.calibration.meanErrorPct.toFixed(2)}% mean` : "—"} sub={o.calibration ? `${o.calibration.sampleCount} samples · ${o.modelVersion}` : "warming up"} />
          </div>

          {/* Typical costs */}
          {o.cards ? (
            <section className="mt-10">
              <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">What a typical transaction costs on Mantle today</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {o.cards.map((c) => (
                  <div key={c.id} className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card">
                    <p className="text-sm font-semibold text-ink">{c.label}</p>
                    <p className="mt-2 font-mono text-2xl text-brand-500">{fmtMnt(c.totalMnt)} MNT</p>
                    <div className="mt-3 flex h-2 overflow-hidden rounded-pill">
                      <span style={{ width: `${Math.max(100 - c.daPct, 2)}%`, background: "var(--brand-500)" }} />
                      <span style={{ width: `${Math.max(c.daPct, 0.5)}%`, background: "var(--warning)" }} />
                    </div>
                    <p className="mt-2 font-mono text-[11px] text-muted">L2 exec {fmtMnt(c.l2Mnt)} · DA {fmtMnt(c.daMnt)} ({c.daPct.toFixed(2)}%) · ~{c.bytes} calldata bytes · estimate</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Oracle-vs-receipt tracker (embeddable) */}
          <section className="mt-10 rounded-card border border-border-subtle bg-surface-1 p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">Oracle prediction vs charged receipt fee</h2>
              <Link href="/embed/observatory/oracle" className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600">Embeddable chart <ArrowUpRight size={12} /></Link>
            </div>
            <div className="mt-4"><OracleChart series={o.oracle.series} anchors={o.oracle.anchors} /></div>
            <p className="mt-3 font-mono text-[11px] text-muted">Receipt (green) = charged <span className="text-text-code">l1Fee</span> per byte; oracle (amber) = legacy <span className="text-text-code">getL1Fee</span> prediction for the same payload. Embed: <span className="text-text-code">&lt;iframe src=&quot;https://archonaudit.xyz/embed/observatory/oracle&quot;&gt;</span></p>
          </section>

          {/* Trends + recent */}
          <div className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <section className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card">
              <h3 className="text-sm font-semibold text-ink">DA cost / byte trend</h3>
              <ul className="mt-3 space-y-2">
                {o.trends.map((t) => (
                  <li key={t.window} className="flex items-center justify-between text-sm"><span className="text-text-mid">{t.window}</span><span className="font-mono text-text-hi">{fmtGwei(t.daPerByteGwei)} gwei <span className="text-muted">· {t.sampleCount} samples</span></span></li>
                ))}
              </ul>
            </section>
            <section className="overflow-x-auto rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card">
              <h3 className="text-sm font-semibold text-ink">Recent samples</h3>
              <table className="mt-3 w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-[0.1em] text-muted"><th className="pb-2">Tx</th><th className="pb-2">Bytes</th><th className="pb-2">DA (receipt)</th><th className="pb-2">Oracle</th></tr></thead>
                <tbody>
                  {o.recent.map((r) => (
                    <tr key={r.txHash} className="border-t border-border-subtle">
                      <td className="py-1.5"><a href={explorerTx(r.txHash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-brand-500 hover:text-brand-600">{r.txHash.slice(0, 10)}…</a></td>
                      <td className="py-1.5 font-mono text-xs text-text-mid">{r.bytes}</td>
                      <td className="py-1.5 font-mono text-xs text-text-hi">{fmtMnt(r.daMnt)}</td>
                      <td className="py-1.5 font-mono text-xs text-muted">{r.oracleMnt != null ? fmtMnt(r.oracleMnt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <p className="mt-8 text-xs text-muted">Model {o.modelVersion}{o.calibration ? ` · recalibrated ${new Date(o.calibration.calibratedAt).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}. All figures are decision-support, not guarantees; DA values are receipt-measured, costs marked estimates. Snapshot JSON: <Link href="/api/observatory" className="text-brand-500 hover:text-brand-600">/api/observatory</Link>.</p>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-card">
      <p className="text-xs uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-2 font-mono text-2xl text-ink">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{sub}</p>
    </div>
  );
}
