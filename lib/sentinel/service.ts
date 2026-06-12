import { createPublicClient, http, isAddress, keccak256, type Address, type Hex } from "viem";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { mantleMainnet } from "@/lib/chain/mantle";
import { enqueueScan } from "@/lib/queue/scans";

// Archon Sentinel (F1): continuous audit of deployed Mantle contracts.
// One repeatable cycle checks each watched address for bytecode drift,
// EIP-1967 implementation/admin drift, owner() drift, and newly verified
// source. Committed drift (debounced over two consecutive cycles so RPC flaps
// never alert) triggers a normal Archon re-scan; when it completes, findings
// are diffed against the previous report and alerts fire (bell + webhook).
// Read-only end to end: Sentinel never sends a transaction.

const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;
const OWNER_SELECTOR = "0x8da5cb5b" as const; // owner()
const ZERO32 = `0x${"0".repeat(64)}`;
const RPC_BUDGET = Number(process.env.SENTINEL_RPC_BUDGET ?? 240);
const WATCHES_PER_CYCLE = Number(process.env.SENTINEL_WATCHES_PER_CYCLE ?? 60);
const DEBOUNCE_CYCLES = 2;

type WatchRow = {
  id: string;
  owner: string;
  address: string;
  label: string | null;
  mode: string;
  source_verified: boolean;
  bytecode_hash: string | null;
  impl_slot: string | null;
  admin_slot: string | null;
  owner_addr: string | null;
  candidate_state: { hash: string; cycles: number } | null;
  pending_scan_id: string | null;
  last_report_id: string | null;
  consecutive_failures: number;
};

type ChainState = { bytecodeHash: string | null; impl: string | null; admin: string | null; ownerAddr: string | null };

function client() {
  // Dedicated batched transport: a cycle's reads coalesce into few HTTP calls.
  return createPublicClient({ chain: mantleMainnet, transport: http(process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz", { batch: true }) });
}

const slotValue = (raw: Hex | undefined | null) => (!raw || raw === ZERO32 ? null : `0x${raw.slice(-40)}`.toLowerCase());

/** Read the full observable state of an address. ~4 RPC reads (batched). */
export async function readChainState(address: Address): Promise<ChainState> {
  const pc = client();
  const [code, implRaw, adminRaw, ownerRaw] = await Promise.all([
    pc.getCode({ address }),
    pc.getStorageAt({ address, slot: IMPL_SLOT }),
    pc.getStorageAt({ address, slot: ADMIN_SLOT }),
    pc.call({ to: address, data: OWNER_SELECTOR }).then((r) => r.data ?? null).catch(() => null), // not Ownable → fine
  ]);
  return {
    bytecodeHash: code && code !== "0x" ? keccak256(code) : null,
    // zero slot = "not a proxy", never a drift signal on its own
    impl: slotValue(implRaw),
    admin: slotValue(adminRaw),
    ownerAddr: ownerRaw && ownerRaw.length >= 66 ? `0x${ownerRaw.slice(-40)}`.toLowerCase() : null,
  };
}

/** Explorer verified-source check (same endpoint the scan pipeline uses). */
export async function checkVerifiedSource(address: string): Promise<boolean> {
  const explorerUrl = process.env.MANTLE_EXPLORER_API_URL ?? "https://explorer.mantle.xyz/api";
  try {
    const response = await fetch(`${explorerUrl}?module=contract&action=getsourcecode&address=${address}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return false;
    const payload = await response.json() as { result?: Array<{ SourceCode?: string }> };
    return Boolean(payload.result?.[0]?.SourceCode?.trim());
  } catch {
    return false;
  }
}

export async function addWatch(owner: string, address: string, label: string | null) {
  if (!isAddress(address)) throw new Error("Enter a valid Mantle contract address.");
  const state = await readChainState(address as Address);
  if (!state.bytecodeHash) throw new Error("No contract bytecode at this address on Mantle Mainnet.");
  const verified = await checkVerifiedSource(address);
  const result = await db.query<{ id: string }>(
    `insert into sentinel_watches (owner, address, label, mode, source_verified, bytecode_hash, impl_slot, admin_slot, owner_addr, last_checked_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     on conflict (owner, address) do update set status='active', label=coalesce(excluded.label, sentinel_watches.label)
     returning id`,
    [owner.toLowerCase(), address.toLowerCase(), label, verified ? "full" : "reduced", verified, state.bytecodeHash, state.impl, state.admin, state.ownerAddr],
  );
  return { id: result.rows[0]!.id, mode: verified ? "full" : "reduced", verified };
}

async function recordEvent(watchId: string, type: string, detail: Record<string, unknown>, refs: { scanId?: string | null; reportId?: string | null } = {}) {
  await db.query(`insert into sentinel_events (watch_id, type, detail, scan_id, report_id) values ($1,$2,$3::jsonb,$4,$5)`, [watchId, type, JSON.stringify(detail), refs.scanId ?? null, refs.reportId ?? null]);
}

async function fireWebhook(owner: string, message: string) {
  const row = (await db.query<{ webhook_url: string | null }>(`select webhook_url from sentinel_settings where owner=$1`, [owner])).rows[0];
  const url = row?.webhook_url;
  if (!url) return;
  try {
    // Discord accepts {content}; Slack accepts {text}; send both keys.
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: message, text: message }), signal: AbortSignal.timeout(5_000) });
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "sentinel webhook delivery failed");
  }
}

function driftDiffs(watch: WatchRow, state: ChainState) {
  const diffs: Array<{ type: string; before: string | null; after: string | null }> = [];
  if (state.bytecodeHash !== watch.bytecode_hash) diffs.push({ type: "bytecode_drift", before: watch.bytecode_hash, after: state.bytecodeHash });
  if (state.impl !== watch.impl_slot) diffs.push({ type: "impl_drift", before: watch.impl_slot, after: state.impl });
  if (state.admin !== watch.admin_slot) diffs.push({ type: "admin_drift", before: watch.admin_slot, after: state.admin });
  if (state.ownerAddr !== watch.owner_addr) diffs.push({ type: "owner_drift", before: watch.owner_addr, after: state.ownerAddr });
  return diffs;
}

async function triggerRescan(watch: WatchRow) {
  const label = `Sentinel: ${watch.label ?? watch.address.slice(0, 10)}`;
  const result = await db.query<{ id: string }>(
    `insert into scans (source_kind, source_ref, network, scan_depth, protocols, status, progress, current_stage, created_at)
     values ('address', $1, 'mantle-mainnet', 'quick', '["mETH"]'::jsonb, 'queued', 0, 'Queued', now()) returning id`,
    [watch.address],
  );
  const scanId = result.rows[0]!.id;
  await enqueueScan(scanId);
  await db.query(`update sentinel_watches set pending_scan_id=$2 where id=$1`, [watch.id, scanId]);
  await recordEvent(watch.id, "rescan_started", { label }, { scanId });
  return scanId;
}

type FindingKey = string;
const findingKey = (f: { severity: string; category: string; title: string; file: string }): FindingKey => `${f.severity}|${f.category}|${f.title}|${f.file}`;

async function settlePendingScan(watch: WatchRow) {
  if (!watch.pending_scan_id) return;
  const scan = (await db.query<{ status: string; error: string | null }>(`select status, error from scans where id=$1`, [watch.pending_scan_id])).rows[0];
  if (!scan || scan.status === "queued" || scan.status === "running") return;
  if (scan.status === "failed") {
    await recordEvent(watch.id, "rescan_failed", { error: scan.error }, { scanId: watch.pending_scan_id });
    await db.query(`update sentinel_watches set pending_scan_id=null where id=$1`, [watch.id]);
    return;
  }
  const report = (await db.query<{ id: string; risk_score: number; contract_name: string }>(`select id, risk_score, contract_name from reports where scan_id=$1 order by created_at desc limit 1`, [watch.pending_scan_id])).rows[0];
  if (!report) {
    await db.query(`update sentinel_watches set pending_scan_id=null where id=$1`, [watch.id]);
    return;
  }
  const [next, prev] = await Promise.all([
    db.query<{ severity: string; category: string; title: string; file: string }>(`select severity, category, title, file from findings where report_id=$1`, [report.id]),
    watch.last_report_id
      ? db.query<{ severity: string; category: string; title: string; file: string }>(`select severity, category, title, file from findings where report_id=$1`, [watch.last_report_id])
      : Promise.resolve({ rows: [] as Array<{ severity: string; category: string; title: string; file: string }> }),
  ]);
  const prevKeys = new Set(prev.rows.map(findingKey));
  const nextKeys = new Set(next.rows.map(findingKey));
  const newFindings = next.rows.filter((f) => !prevKeys.has(findingKey(f)));
  const resolved = prev.rows.filter((f) => !nextKeys.has(findingKey(f)));
  const riskBefore = watch.last_report_id
    ? (await db.query<{ risk_score: number }>(`select risk_score from reports where id=$1`, [watch.last_report_id])).rows[0]?.risk_score ?? null
    : null;

  await recordEvent(watch.id, "rescan_complete", {
    contract: report.contract_name,
    riskBefore,
    riskAfter: report.risk_score,
    newFindings: newFindings.length,
    resolvedFindings: resolved.length,
    topNew: newFindings.slice(0, 5).map((f) => `${f.severity}: ${f.title}`),
  }, { scanId: watch.pending_scan_id, reportId: report.id });
  if (riskBefore !== null && report.risk_score > riskBefore) {
    await recordEvent(watch.id, "risk_increased", { from: riskBefore, to: report.risk_score }, { reportId: report.id });
  }
  await db.query(`update sentinel_watches set pending_scan_id=null, last_report_id=$2 where id=$1`, [watch.id, report.id]);
  await fireWebhook(watch.owner, `Archon Sentinel — re-scan of ${watch.label ?? watch.address} complete: risk ${riskBefore ?? "—"} → ${report.risk_score}, ${newFindings.length} new / ${resolved.length} resolved finding(s). https://archonaudit.xyz/r/${report.id}`);
}

/** One Sentinel cycle. Bounded RPC budget with backpressure: skip + log, never pile up. */
export async function runSentinelCycle() {
  const started = Date.now();
  const watches = (await db.query<WatchRow>(
    `select id, owner, address, label, mode, source_verified, bytecode_hash, impl_slot, admin_slot, owner_addr, candidate_state, pending_scan_id, last_report_id, consecutive_failures
       from sentinel_watches where status='active' order by last_checked_at asc nulls first limit $1`,
    [WATCHES_PER_CYCLE],
  )).rows;
  // Per-address jitter: shuffle so the same watch never monopolizes the budget edge.
  watches.sort(() => Math.random() - 0.5);

  let rpcCalls = 0, drifts = 0, rescans = 0, skipped = 0;
  for (const watch of watches) {
    if (rpcCalls + 4 > RPC_BUDGET) { skipped += 1; continue; }
    try {
      await settlePendingScan(watch);
      const state = await readChainState(watch.address as Address);
      rpcCalls += 4;
      const diffs = driftDiffs(watch, state);
      if (!diffs.length) {
        await db.query(`update sentinel_watches set last_checked_at=now(), candidate_state=null, consecutive_failures=0 where id=$1`, [watch.id]);
        continue;
      }
      // Debounce: the same changed state must be observed two cycles in a row.
      const candidateHash = keccak256(`0x${Buffer.from(JSON.stringify(diffs)).toString("hex")}`);
      const cycles = watch.candidate_state?.hash === candidateHash ? watch.candidate_state.cycles + 1 : 1;
      if (cycles < DEBOUNCE_CYCLES) {
        await db.query(`update sentinel_watches set last_checked_at=now(), candidate_state=$2::jsonb where id=$1`, [watch.id, JSON.stringify({ hash: candidateHash, cycles })]);
        continue;
      }
      // Committed drift: update baseline, record one event per dimension, alert.
      drifts += 1;
      await db.query(
        `update sentinel_watches set last_checked_at=now(), candidate_state=null, last_drift_at=now(), bytecode_hash=$2, impl_slot=$3, admin_slot=$4, owner_addr=$5, consecutive_failures=0 where id=$1`,
        [watch.id, state.bytecodeHash, state.impl, state.admin, state.ownerAddr],
      );
      for (const diff of diffs) await recordEvent(watch.id, diff.type, { before: diff.before, after: diff.after });
      await fireWebhook(watch.owner, `Archon Sentinel — drift on ${watch.label ?? watch.address}: ${diffs.map((d) => d.type.replace("_", " ")).join(", ")}. Re-scan ${watch.source_verified || state.bytecodeHash ? "starting" : "skipped (no verified source)"} · https://archonaudit.xyz/app/sentinel`);
      // Re-scan needs verified source; reduced-mode watches get a fresh verification check first.
      let verified = watch.source_verified;
      if (!verified) {
        verified = await checkVerifiedSource(watch.address);
        if (verified) {
          await db.query(`update sentinel_watches set source_verified=true, mode='full' where id=$1`, [watch.id]);
          await recordEvent(watch.id, "source_verified", {});
        }
      }
      if (verified && state.bytecodeHash && !watch.pending_scan_id) {
        await triggerRescan({ ...watch, source_verified: true });
        rescans += 1;
      }
    } catch (error) {
      rpcCalls += 1;
      await db.query(`update sentinel_watches set last_checked_at=now(), consecutive_failures=consecutive_failures+1 where id=$1`, [watch.id]);
      logger.warn({ watch: watch.address, err: error instanceof Error ? error.message : String(error) }, "sentinel check failed");
    }
  }
  logger.info({ watches: watches.length, rpcCalls, drifts, rescans, skipped, ms: Date.now() - started }, "sentinel cycle complete");
  return { watches: watches.length, rpcCalls, drifts, rescans, skipped };
}

/** Audit-freshness for a watch row (computed at read time; surfaces honest staleness). */
export function freshness(input: { lastReportAt: string | null; anchored: boolean; driftsSinceReport: number; critHigh: number }) {
  if (!input.lastReportAt) return { level: "unaudited", reason: "No Archon report yet for this address." };
  const days = Math.floor((Date.now() - new Date(input.lastReportAt).getTime()) / 86_400_000);
  if (input.driftsSinceReport > 0) return { level: "stale", reason: `${input.driftsSinceReport} drift event(s) since the last report.`, days };
  if (input.critHigh > 0) return { level: "attention", reason: `${input.critHigh} unresolved critical/high finding(s).`, days };
  if (days > 30) return { level: "aging", reason: `Last report is ${days} days old.`, days };
  return { level: "fresh", reason: input.anchored ? `Anchored report, ${days} day(s) old, no drift since.` : `Report is ${days} day(s) old, no drift since (not yet anchored).`, days };
}
