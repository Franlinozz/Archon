import { db } from "@/lib/db/client";
import { ORACLE_DIVERGENCE } from "@/lib/marketing/stats";
import { OBSERVATORY_MODEL_VERSION } from "@/lib/observatory/sampler";

// Public Observatory aggregates — every number traces to stored receipt samples
// (gas_samples) or the verified ADR 0007 anchors. Nothing-fake: sample sizes are
// always surfaced, and an empty store yields nulls (the page shows "warming up").

export type ObservatorySnapshot = Awaited<ReturnType<typeof getObservatory>>;

// pg returns numeric as string but float8 (percentile_cont/avg) as a JS number;
// coerce either to bigint wei safely (these per-byte/fee values are < 1e15, so
// String() never goes exponential).
const toBig = (v: unknown): bigint => {
  if (v == null) return 0n;
  if (typeof v === "bigint") return v;
  return BigInt(String(v).split(".")[0] || "0");
};
const mnt = (wei: bigint | number | string) => Number(toBig(wei)) / 1e18;

export async function getObservatory() {
  const [model, current, windows, oracleSeries, oracleAgg, recentSamples] = await Promise.all([
    db.query<{ zero_byte_fee_wei: string; sample_count: number; mean_error_pct: string; max_error_pct: string; model_version: string; calibrated_at: string }>(
      `select zero_byte_fee_wei, sample_count, mean_error_pct, max_error_pct, model_version, calibrated_at from observatory_model where id=1`),
    db.query<{ da_per_byte: string | null; l2_base_fee: string | null; n: number }>(
      `select percentile_cont(0.5) within group (order by l1_fee_wei / nullif(total_bytes,0)) as da_per_byte,
              percentile_cont(0.5) within group (order by l2_base_fee_wei) as l2_base_fee,
              count(*)::int as n
         from gas_samples where sampled_at > now() - interval '24 hours' and total_bytes > 0`),
    db.query<{ win: string; da_per_byte: string | null; n: number }>(
      `select w.win, percentile_cont(0.5) within group (order by s.l1_fee_wei / nullif(s.total_bytes,0)) as da_per_byte, count(s.*)::int as n
         from (values ('24h', interval '24 hours'), ('7d', interval '7 days'), ('30d', interval '30 days')) as w(win, span)
         left join gas_samples s on s.sampled_at > now() - w.span and s.total_bytes > 0
         group by w.win`),
    db.query<{ bucket: string; actual: string | null; oracle: string | null; n: number }>(
      `select to_char(date_trunc('day', sampled_at), 'YYYY-MM-DD') as bucket,
              avg(l1_fee_wei / nullif(total_bytes,0)) as actual,
              avg(oracle_l1_fee_wei / nullif(total_bytes,0)) as oracle,
              count(*)::int as n
         from gas_samples where sampled_at > now() - interval '30 days' and total_bytes > 0
         group by 1 order by 1`),
    db.query<{ actual_sum: string | null; oracle_sum: string | null; n: number }>(
      `select sum(l1_fee_wei) as actual_sum, sum(oracle_l1_fee_wei) as oracle_sum, count(*)::int as n
         from gas_samples where oracle_l1_fee_wei is not null and total_bytes > 0`),
    db.query<{ tx_hash: string; total_bytes: number; l1_fee_wei: string; oracle_l1_fee_wei: string | null; block_number: number; sampled_at: string }>(
      `select tx_hash, total_bytes, l1_fee_wei, oracle_l1_fee_wei, block_number, sampled_at from gas_samples order by sampled_at desc limit 8`),
  ]);

  const m = model.rows[0] ?? null;
  const cur = current.rows[0] ?? null;
  const daPerByteWei = cur?.da_per_byte != null ? toBig(cur.da_per_byte) : null;
  const l2BaseFeeWei = cur?.l2_base_fee != null ? toBig(cur.l2_base_fee) : null;

  // Typical-cost cards: representative calldata byte counts × current DA rate +
  // L2 execution at the current base fee. Labeled estimates; DA is receipt-derived.
  const profiles = [
    { id: "transfer", label: "ERC-20 transfer", bytes: 68, l2Gas: 51_000 },
    { id: "swap", label: "DEX swap", bytes: 260, l2Gas: 180_000 },
    { id: "deploy", label: "Contract deploy", bytes: 6_000, l2Gas: 1_200_000 },
  ];
  const cards = daPerByteWei && l2BaseFeeWei ? profiles.map((p) => {
    const daWei = daPerByteWei * BigInt(p.bytes);
    const l2Wei = l2BaseFeeWei * BigInt(p.l2Gas);
    const total = daWei + l2Wei;
    const daPct = total > 0n ? Number((daWei * 10000n) / total) / 100 : 0;
    return { ...p, daMnt: mnt(daWei), l2Mnt: mnt(l2Wei), totalMnt: mnt(total), daPct };
  }) : null;

  // Headline divergence: prefer live oracle samples; else fall back to the
  // verified ADR 0007 anchors (always real).
  const liveActual = toBig(oracleAgg.rows[0]?.actual_sum);
  const liveOracle = toBig(oracleAgg.rows[0]?.oracle_sum);
  const liveDivergence = liveActual > 0n && liveOracle > 0n
    ? { underReportPct: Number(((liveActual - liveOracle) * 1000000n) / liveActual) / 10000, sampleCount: oracleAgg.rows[0]!.n, source: "live" as const }
    : null;

  return {
    generatedAt: new Date().toISOString(),
    modelVersion: m?.model_version ?? OBSERVATORY_MODEL_VERSION,
    calibration: m ? { daPerByteWei: m.zero_byte_fee_wei, sampleCount: m.sample_count, meanErrorPct: Number(m.mean_error_pct), maxErrorPct: Number(m.max_error_pct), calibratedAt: m.calibrated_at } : null,
    current: { daPerByteWei: daPerByteWei?.toString() ?? null, daPerByteGwei: daPerByteWei ? Number(daPerByteWei) / 1e9 : null, l2BaseFeeWei: l2BaseFeeWei?.toString() ?? null, l2BaseFeeGwei: l2BaseFeeWei ? Number(l2BaseFeeWei) / 1e9 : null, sampleCount24h: cur?.n ?? 0 },
    trends: windows.rows.map((w) => ({ window: w.win, daPerByteGwei: w.da_per_byte != null ? Number(toBig(w.da_per_byte)) / 1e9 : null, sampleCount: w.n })),
    cards,
    oracle: {
      live: liveDivergence,
      anchors: ORACLE_DIVERGENCE.rows.map((r) => ({ txShort: r.txShort, txHash: r.txHash, actualMnt: mnt(r.actualWei), oracleMnt: mnt(r.oracleWei), underReportPct: r.underReportPct })),
      series: oracleSeries.rows.filter((r) => r.oracle).map((r) => ({ bucket: r.bucket, actualGwei: r.actual != null ? Number(toBig(r.actual)) / 1e9 : null, oracleGwei: r.oracle != null ? Number(toBig(r.oracle)) / 1e9 : null, n: r.n })),
    },
    recent: recentSamples.rows.map((r) => ({ txHash: r.tx_hash, bytes: r.total_bytes, daMnt: mnt(r.l1_fee_wei), oracleMnt: r.oracle_l1_fee_wei ? mnt(r.oracle_l1_fee_wei) : null, block: r.block_number, at: r.sampled_at })),
  };
}
