import type { Metadata } from "next";
import { getObservatory } from "@/lib/observatory/stats";
import { OracleChart } from "@/components/observatory/OracleChart";

// Chrome-less, iframe-embeddable snapshot of the oracle-vs-receipt tracker.
// No site header/footer, no auth — drop it into a slide or a blog post.
export const revalidate = 300;
export const metadata: Metadata = { title: "Mantle oracle vs receipt DA fee — Archon Observatory", robots: { index: false } };

export default async function OracleEmbed() {
  const o = await getObservatory().catch(() => null);
  return (
    <main className="min-h-screen bg-canvas p-4 text-text-hi">
      <div className="mx-auto max-w-3xl rounded-card border border-border-subtle bg-surface-1 p-5">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-brand-500">Mantle DA: oracle vs receipt</p>
          <a href="https://archonaudit.xyz/observatory" target="_blank" rel="noreferrer" className="text-[11px] text-muted hover:text-text-hi">archonaudit.xyz/observatory</a>
        </div>
        {o ? <div className="mt-3"><OracleChart series={o.oracle.series} anchors={o.oracle.anchors} height={300} /></div> : <p className="mt-6 text-sm text-muted">Warming up.</p>}
        <p className="mt-2 font-mono text-[10px] text-muted">Receipt-measured DA fee vs legacy GasPriceOracle prediction. Source: Archon · receipt-calibrated · {o?.modelVersion}</p>
      </div>
    </main>
  );
}
