import { createPublicClient, http, formatEther, type Hex } from "viem";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { mantleMainnet, MANTLE_EXPLORER_URL } from "@/lib/chain/mantle";
import { calldataByteProfile } from "@/lib/gas/da-pricing";

// Mantle Gas Observatory sampler (F5). One repeatable worker pulls recent
// blocks, derives each tx's real DA cost from its receipt `l1Fee`, records the
// legacy GasPriceOracle prediction for the same payload (best-effort), and
// stores samples. The SAME store recalibrates the gas engine's DA model — one
// worker, two consumers. Read-only; hard per-day RPC budget with backpressure.

const GAS_PRICE_ORACLE = "0x420000000000000000000000000000000000000F" as const;
const ORACLE_ABI = [{ type: "function", name: "getL1Fee", stateMutability: "view", inputs: [{ name: "_data", type: "bytes" }], outputs: [{ type: "uint256" }] }] as const;

const DAILY_RPC_BUDGET = Number(process.env.OBSERVATORY_DAILY_RPC_BUDGET ?? 2000);
const TX_PER_CYCLE = Number(process.env.OBSERVATORY_TX_PER_CYCLE ?? 12);
const BLOCK_LOOKBACK = 6; // sample a block with some finality margin
export const OBSERVATORY_MODEL_VERSION = "mantle-da-v1-2026-06";

function client() {
  return createPublicClient({ chain: mantleMainnet, transport: http(process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz", { batch: true }) });
}

async function spendBudget(day: string, n: number): Promise<boolean> {
  const row = (await db.query<{ rpc_calls: number }>(
    `insert into observatory_budget (day, rpc_calls) values ($1,$2)
     on conflict (day) do update set rpc_calls = observatory_budget.rpc_calls + $2 returning rpc_calls`,
    [day, n],
  )).rows[0];
  return (row?.rpc_calls ?? 0) <= DAILY_RPC_BUDGET;
}

/** Stratified pick: spread indices across the block so we don't bias to the front. */
function stratify<T>(items: T[], k: number): T[] {
  if (items.length <= k) return items;
  const step = items.length / k;
  return Array.from({ length: k }, (_, i) => items[Math.floor(i * step)]!);
}

export async function runObservatoryCycle() {
  const started = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const pc = client();
  let rpcCalls = 0, stored = 0, oracleOk = 0;

  try {
    if (!(await spendBudget(day, 1))) { logger.warn({ day }, "observatory daily RPC budget exhausted; skipping cycle"); return { skipped: true }; }
    const latest = await pc.getBlockNumber(); rpcCalls += 1;
    const block = await pc.getBlock({ blockNumber: latest - BigInt(BLOCK_LOOKBACK), includeTransactions: true }); rpcCalls += 1;
    const l2BaseFee = block.baseFeePerGas ?? 0n;

    // Only txs carrying calldata are informative for DA-cost-per-byte.
    const withData = block.transactions.filter((t) => typeof t === "object" && t.input && t.input !== "0x");
    const picks = stratify(withData, TX_PER_CYCLE);

    for (const tx of picks) {
      if (typeof tx !== "object") continue;
      if (!(await spendBudget(day, 2))) break; // budget guard mid-loop
      try {
        const receipt = await pc.getTransactionReceipt({ hash: tx.hash }); rpcCalls += 1;
        // Mantle receipts carry l1Fee (the real charged DA fee).
        const l1Fee = (receipt as unknown as { l1Fee?: bigint }).l1Fee;
        if (l1Fee == null) continue;
        const profile = calldataByteProfile(tx.input as Hex);

        // Legacy oracle prediction for the same calldata (best-effort; nullable).
        let oracleFee: bigint | null = null;
        try {
          oracleFee = await pc.readContract({ address: GAS_PRICE_ORACLE, abi: ORACLE_ABI, functionName: "getL1Fee", args: [tx.input as Hex] }) as bigint;
          rpcCalls += 1; oracleOk += 1;
        } catch { /* oracle call unsupported at this node — store null */ }

        await db.query(
          `insert into gas_samples (tx_hash, block_number, zero_bytes, nonzero_bytes, total_bytes, l1_fee_wei, oracle_l1_fee_wei, l2_base_fee_wei, l2_gas_used)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (tx_hash) do nothing`,
          [tx.hash, Number(block.number), profile.zeroBytes, profile.nonZeroBytes, profile.totalBytes, l1Fee.toString(), oracleFee?.toString() ?? null, l2BaseFee.toString(), (receipt.gasUsed ?? 0n).toString()],
        );
        stored += 1;
      } catch (error) {
        logger.warn({ tx: typeof tx === "object" ? tx.hash : "?", err: error instanceof Error ? error.message : String(error) }, "observatory sample failed");
      }
    }

    await recalibrateFromSamples();
    logger.info({ rpcCalls, stored, oracleOk, block: Number(block.number), ms: Date.now() - started }, "observatory cycle complete");
    return { rpcCalls, stored, oracleOk };
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "observatory cycle error");
    return { error: true };
  }
}

/**
 * Recalibrate the DA model from the trailing 7 days of samples via a 2-variable
 * least-squares fit of fee ≈ zeroByteFee·z + nonZeroByteFee·n (zero and nonzero
 * calldata bytes are priced differently on the EVM, so a flat rate misfits).
 * The sampler's receipt store is the shared calibration source; the gas engine
 * keeps its own exact 2-receipt solve for live pricing until this matches it.
 */
export async function recalibrateFromSamples() {
  const rows = (await db.query<{ zero_bytes: number; nonzero_bytes: number; l1_fee_wei: string }>(
    `select zero_bytes, nonzero_bytes, l1_fee_wei from gas_samples where sampled_at > now() - interval '7 days' and total_bytes > 0 order by sampled_at desc limit 1000`,
  )).rows;
  if (rows.length < 8) return null;

  // Scale fees to gwei for the float regression (wei overflows precision badly).
  const z = rows.map((r) => r.zero_bytes);
  const n = rows.map((r) => r.nonzero_bytes);
  const f = rows.map((r) => Number(BigInt(r.l1_fee_wei.split(".")[0] ?? "0")) / 1e9);
  let Szz = 0, Snn = 0, Szn = 0, Szf = 0, Snf = 0;
  for (let i = 0; i < rows.length; i++) { Szz += z[i]! * z[i]!; Snn += n[i]! * n[i]!; Szn += z[i]! * n[i]!; Szf += z[i]! * f[i]!; Snf += n[i]! * f[i]!; }
  const det = Szz * Snn - Szn * Szn;
  let zeroRateWei: bigint, nonZeroRateWei: bigint;
  if (Math.abs(det) > 1e-6) {
    const a = Math.max(0, (Snn * Szf - Szn * Snf) / det); // gwei per zero byte
    const b = Math.max(0, (Szz * Snf - Szn * Szf) / det); // gwei per nonzero byte
    zeroRateWei = BigInt(Math.round(a * 1e9));
    nonZeroRateWei = BigInt(Math.round(b * 1e9));
  } else {
    const totalFee = rows.reduce((s, r) => s + BigInt(r.l1_fee_wei.split(".")[0] ?? "0"), 0n);
    const totalBytes = rows.reduce((s, r) => s + BigInt(Math.max(1, r.zero_bytes + r.nonzero_bytes)), 0n);
    zeroRateWei = nonZeroRateWei = totalBytes > 0n ? totalFee / totalBytes : 0n;
  }

  const errs = rows.map((r, i) => {
    const predicted = zeroRateWei * BigInt(r.zero_bytes) + nonZeroRateWei * BigInt(r.nonzero_bytes);
    const actual = BigInt(r.l1_fee_wei.split(".")[0] ?? "0");
    void i;
    if (actual === 0n) return 0;
    const diff = predicted > actual ? predicted - actual : actual - predicted;
    return Number((diff * 1_000_000n) / actual) / 10_000;
  });
  const meanErr = errs.reduce((s, e) => s + e, 0) / errs.length;
  const maxErr = Math.max(...errs);

  await db.query(
    `insert into observatory_model (id, zero_byte_fee_wei, nonzero_byte_fee_wei, sample_count, mean_error_pct, max_error_pct, model_version, calibrated_at)
     values (1,$1,$2,$3,$4,$5,$6, now())
     on conflict (id) do update set zero_byte_fee_wei=excluded.zero_byte_fee_wei, nonzero_byte_fee_wei=excluded.nonzero_byte_fee_wei, sample_count=excluded.sample_count, mean_error_pct=excluded.mean_error_pct, max_error_pct=excluded.max_error_pct, model_version=excluded.model_version, calibrated_at=now()`,
    [zeroRateWei.toString(), nonZeroRateWei.toString(), rows.length, meanErr, maxErr, OBSERVATORY_MODEL_VERSION],
  );
  return { zeroRateWei: zeroRateWei.toString(), nonZeroRateWei: nonZeroRateWei.toString(), sampleCount: rows.length, meanErr, maxErr };
}

export function explorerTx(hash: string) {
  return `${MANTLE_EXPLORER_URL}/tx/${hash}`;
}
