import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/motion";

export const metadata: Metadata = {
  title: "Observatory methodology — Archon",
  description: "How the Mantle Gas Observatory samples receipts, calibrates the DA model, and labels every number.",
};

export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-text-hi md:py-20">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-500">Observatory · methodology</p>
        <h1 className="mt-3 font-display text-4xl tracking-[-0.03em] text-ink md:text-5xl">How the numbers are made.</h1>
        <p className="mt-4 text-sm leading-7 text-body">The <Link href="/observatory" className="text-brand-500 hover:text-brand-600">Observatory</Link> inherits Archon&apos;s nothing-fake rule: every figure traces to real Mantle receipts, and sample sizes are always shown.</p>
      </Reveal>

      <div className="archon-docs-prose mt-8">
        <h2>Sampling</h2>
        <p>A repeatable worker pulls a recent Mantle block (with a small finality margin), selects transactions that carry calldata, and stratifies the selection across the block so the sample is not biased toward the front. For each transaction it reads the receipt&apos;s <code>l1Fee</code> — the data-availability fee the chain <em>actually charged</em> — and computes the calldata byte profile (zero vs nonzero bytes). The block&apos;s <code>baseFeePerGas</code> is recorded as the L2 base fee.</p>
        <p>Each cycle runs under a hard per-day RPC budget with backpressure: when the budget is reached the cycle stops and logs, never piling up. Per-cycle call counts are logged.</p>

        <h2>The oracle comparison</h2>
        <p>For each sampled transaction the worker also calls the legacy <code>GasPriceOracle.getL1Fee</code> predeploy with the same calldata, best-effort, and stores the prediction alongside the charged fee. The tracker chart plots receipt fee versus oracle prediction per byte. Where the oracle call is unavailable at the node, the prediction is stored as null and excluded (the sample count reflects this). The two verified reference transactions from <a href="https://github.com/Franlinozz/Archon/blob/main/docs/decisions/0007-mantle-gas-oracle-verification.md">ADR 0007</a> anchor the chart when live oracle samples are still thin.</p>
        <p><strong>One caveat, stated plainly:</strong> the oracle is queried with the transaction&apos;s calldata payload (not the full RLP-serialized transaction), so the absolute prediction is approximate; the order-of-magnitude divergence it reveals — the chain charges thousands of times more than the oracle predicts — is robust and matches ADR 0007.</p>

        <h2>Calibration</h2>
        <p>The same receipt store calibrates a DA model by a two-variable least-squares fit of <code>fee ≈ zeroByteFee·z + nonZeroByteFee·n</code> over the trailing samples (zero and nonzero calldata bytes are priced differently, so a single flat rate misfits). The model is version-stamped and its mean and maximum validation error against the samples are published on the Observatory. Residual error reflects genuine L1 fee-regime variation across the sampling window, not hidden fudging.</p>
        <p>The Observatory is the network-wide view; Archon&apos;s gas engine keeps its own exact two-receipt solve for per-report pricing until the windowed model matches its accuracy.</p>

        <h2>Labeling</h2>
        <ul>
          <li><strong>DA cost per byte / receipt fees</strong> are <em>measured</em> — read directly from receipts.</li>
          <li><strong>Typical-transaction cost cards</strong> are <em>estimates</em>: representative calldata byte counts × the current DA rate, plus L2 execution at the current base fee. Marked as estimates.</li>
          <li><strong>Fee-regime changes:</strong> Mantle upgrades can shift the fee model; the model is version-stamped and recalibrated continuously.</li>
        </ul>

        <h2>Use the data</h2>
        <p>The full snapshot is public JSON at <Link href="/api/observatory">/api/observatory</Link>, and the oracle-vs-receipt chart is iframe-embeddable at <code>/embed/observatory/oracle</code>. Attribution to <Link href="/observatory">archonaudit.xyz/observatory</Link> is appreciated.</p>
      </div>
    </main>
  );
}
