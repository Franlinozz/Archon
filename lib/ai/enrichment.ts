import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { appendScanLog, publishScanEvent } from "@/lib/scan/events";
import { enrichmentSchema, enrichmentErrorKind, providerChain, type AIProvider, type Enrichment, type EnrichmentErrorKind, FINDING_ENRICHMENT_PROMPT_VERSION } from "@/lib/ai/provider";

export { FINDING_ENRICHMENT_PROMPT_VERSION };
const BATCH_SIZE = Number(process.env.ARCHON_AI_ENRICHMENT_BATCH_SIZE ?? 5);
// 75s per call (with one transient retry in the provider).
const CALL_TIMEOUT_MS = Number(process.env.ARCHON_AI_ENRICHMENT_TIMEOUT_MS ?? 75_000);
// Enrich EVERY finding — no compromise. The wall-clock budget is generous (it only
// exists so a pathological scan can't run unbounded) and sits under the runner's
// raised stage watchdog. CONCURRENCY (bounded, well under TokenHub QPM=60) is what
// makes "all findings" fast even with a slow reasoning model — a 126-finding scan
// drops from ~9min to a few minutes at 8-way. Severity ordering means that if the
// (generous) budget is ever exhausted, only the lowest-priority findings degrade.
const MAX_FINDINGS = Number(process.env.ARCHON_AI_ENRICHMENT_MAX_FINDINGS ?? 400);
const ENRICH_BUDGET_MS = Number(process.env.ARCHON_AI_ENRICHMENT_BUDGET_MS ?? 1_020_000); // 17 min, < 20 min stage watchdog
const CONCURRENCY = Math.max(1, Number(process.env.ARCHON_AI_ENRICHMENT_CONCURRENCY ?? 8));
const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

type FindingRow = {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string | null;
  summary: string | null;
  recommended_fix: string | null;
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(finding: FindingRow) {
  return JSON.stringify({
    severity: finding.severity,
    category: finding.category,
    title: finding.title,
    file: finding.file,
    lineStart: finding.line_start,
    lineEnd: finding.line_end,
    codeSnippet: finding.code_snippet,
  });
}

function cacheKey(finding: FindingRow) {
  return hash(`${FINDING_ENRICHMENT_PROMPT_VERSION}:${fingerprint(finding)}`);
}

function patchFor(finding: FindingRow) {
  const text = `${finding.category} ${finding.title}`.toLowerCase();
  if (text.includes("reentrancy") || text.includes("external value transfer")) {
    return `--- a/${finding.file}\n+++ b/${finding.file}\n@@\n-        (bool ok, ) = msg.sender.call{value: amount}("");\n-        require(ok, "TRANSFER_FAILED");\n-\n         balances[msg.sender] -= amount;\n+\n+        (bool ok, ) = msg.sender.call{value: amount}("");\n+        require(ok, "TRANSFER_FAILED");`;
  }
  if (text.includes("slippage")) {
    return `--- a/${finding.file}\n+++ b/${finding.file}\n@@\n         amountOut = (amountIn * 97) / 100;\n-        minAmountOut;\n+        require(amountOut >= minAmountOut, "SLIPPAGE_EXCEEDED");`;
  }
  if (text.includes("gas") || text.includes("cache-array")) {
    return `--- a/${finding.file}\n+++ b/${finding.file}\n@@\n-        for (uint256 i = 0; i < depositors.length; i++) {\n+        uint256 depositorCount = depositors.length;\n+        for (uint256 i = 0; i < depositorCount; i++) {`;
  }
  return `--- a/${finding.file}\n+++ b/${finding.file}\n@@\n-        // vulnerable pattern near line ${finding.line_start ?? "?"}\n+        // apply the recommended guard or validation before this operation`;
}

function fallbackEnrichment(finding: FindingRow): Enrichment {
  const location = `${finding.file}:${finding.line_start ?? "?"}${finding.line_end && finding.line_end !== finding.line_start ? `-${finding.line_end}` : ""}`;
  const isGas = /gas|cache-array|optimization/i.test(`${finding.category} ${finding.title}`);
  const isMantle = /mantle|slippage|oracle|l1-data|reentrancy/i.test(`${finding.category} ${finding.title}`);
  return {
    summary: `${finding.title} was detected from deterministic analysis at ${location}. The issue should be reviewed because it can affect contract correctness, user balances, or operational cost depending on how the function is used.`,
    why_mantle: isMantle
      ? "On Mantle Mainnet, this pattern matters because DeFi integrations, L2 execution assumptions, and protocol-specific liquidity can amplify otherwise familiar EVM risks. The finding remains a recommendation, not a guarantee of exploitability."
      : "On Mantle Mainnet, this should be treated as normal EVM risk intelligence and reviewed against the deployed protocol context before release.",
    exploit_scenario: "A caller interacts with the affected code path under unfavorable state or market conditions and the contract behaves differently from the developer's intended invariant. The impact is framed as software and accounting risk, not as a guaranteed exploit.",
    recommended_fix: finding.recommended_fix ?? "Adjust the affected code so validation and state updates happen before external effects, add explicit bounds where assumptions exist, and add a regression test for this finding.",
    patch_diff: patchFor(finding),
    confidence: finding.severity === "critical" || finding.severity === "high" ? 0.86 : 0.74,
    gas_impact: isGas ? "Likely gas impact: review loop bounds, storage reads, and repeated length access before production deployment." : null,
  };
}

async function fetchCache(finding: FindingRow) {
  const key = cacheKey(finding);
  const result = await db.query<{ response: Enrichment }>("select response from ai_cache where cache_key = $1", [key]);
  const fallback = fallbackEnrichment(finding);
  return result.rows[0]?.response ? { key, enrichment: enrichmentSchema.catch(fallback).parse(result.rows[0].response), hit: true } : { key, enrichment: null, hit: false };
}

async function storeCache(key: string, enrichment: Enrichment) {
  await db.query(
    `insert into ai_cache (cache_key, prompt_version, response, created_at)
     values ($1, $2, $3::jsonb, now())
     on conflict (cache_key) do update set response = excluded.response, prompt_version = excluded.prompt_version`,
    [key, FINDING_ENRICHMENT_PROMPT_VERSION, JSON.stringify(enrichment)],
  );
}

async function emitAiProgress(scanId: string, batchIndex: number, totalBatches: number) {
  const progress = Math.min(74, 63 + Math.ceil(((batchIndex + 1) / Math.max(1, totalBatches)) * 10));
  await db.query("update scans set progress=$2, current_stage='AI Reasoning' where id=$1 and status='running'", [scanId, progress]);
  await publishScanEvent({ type: "stage", scanId, stage: "AI Reasoning", progress, status: "running", at: new Date().toISOString() });
}

type Miss = { finding: FindingRow; key: string };

async function applyFallback(item: Miss) {
  // Write the deterministic explanation but do NOT cache it — so a later re-scan
  // retries the model for this finding instead of being stuck on the fallback.
  await updateFinding(item.finding.id, fallbackEnrichment(item.finding));
}

async function enrichMisses(scanId: string, chain: AIProvider[], misses: Miss[]) {
  const batchSize = chain[0]?.batchSize ?? BATCH_SIZE;
  // Severity-first so any cap/budget pressure only ever costs low/info findings —
  // critical/high are always AI-enriched first.
  const ordered = [...misses].sort((a, b) => (SEVERITY_RANK[a.finding.severity] ?? 5) - (SEVERITY_RANK[b.finding.severity] ?? 5));
  const eligible = ordered.slice(0, MAX_FINDINGS);
  const overCap = ordered.slice(MAX_FINDINGS); // sanity ceiling only

  let enrichedCount = 0;
  // Cause distribution so a residual fallback is diagnosable from the log.
  const reasons: Partial<Record<EnrichmentErrorKind | "no_provider" | "budget" | "capped", number>> = {};
  const bump = (kind: keyof typeof reasons, n: number) => { reasons[kind] = (reasons[kind] ?? 0) + n; };
  const providersUsed = new Set<string>();
  const startedAt = Date.now();
  const overBudget = () => Date.now() - startedAt > ENRICH_BUDGET_MS;
  const totalBatches = Math.max(1, Math.ceil(eligible.length / batchSize));
  let completed = 0;

  // Enrich one batch via the failover chain (primary → fallbacks). Applies the
  // enrichments it receives and RETURNS the items it could not enrich, so a retry
  // pass can take another run at them. tolerantBatch already salvages per-finding,
  // so one bad item never loses the rest of the batch. No deterministic write here.
  const processBatch = async (batch: Miss[]): Promise<Miss[]> => {
    if (overBudget()) { bump("budget", batch.length); return batch; }
    let byId = new Map<string, Enrichment>();
    let servedBy: AIProvider | null = null;
    let lastKind: EnrichmentErrorKind = "unknown";
    for (let p = 0; p < chain.length; p++) {
      const provider = chain[p]!;
      try {
        const parsed = await provider.enrichFindings(batch.map((item) => item.finding), { timeoutMs: CALL_TIMEOUT_MS });
        byId = new Map(parsed.findings.map((item) => [item.id, item.enrichment]));
        servedBy = provider;
        providersUsed.add(`${provider.label} (${provider.model})`);
        break;
      } catch (err) {
        lastKind = enrichmentErrorKind(err);
        const next = chain[p + 1];
        if (next) await appendScanLog(scanId, "WARN", `AI enrichment: ${provider.label} failed (${lastKind}) → failing over to ${next.label}.`);
      }
    }
    const missing: Miss[] = [];
    for (const item of batch) {
      const enrichment = byId.get(item.finding.id);
      if (enrichment) { await storeCache(item.key, enrichment); await updateFinding(item.finding.id, enrichment); enrichedCount += 1; }
      else missing.push(item);
    }
    if (servedBy) await appendScanLog(scanId, missing.length ? "WARN" : "INFO", `AI enrichment: ${servedBy.label} (${servedBy.model}) enriched ${byId.size}/${batch.length} finding(s)${missing.length ? ` — ${missing.length} to retry` : ""}.`);
    else bump(lastKind, batch.length);
    completed += 1;
    await emitAiProgress(scanId, completed - 1, totalBatches);
    return missing;
  };

  // Bounded-concurrency pool over a list of items; returns the items left unenriched.
  const runPool = async (items: Miss[]): Promise<Miss[]> => {
    const batches: Miss[][] = [];
    for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize));
    let nextIndex = 0;
    const leftovers: Miss[] = [];
    const worker = async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= batches.length) return;
        leftovers.push(...await processBatch(batches[i]!));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
    return leftovers;
  };

  let leftover: Miss[] = eligible;
  if (chain.length) {
    // Pass 1 over everything, then ONE retry pass for whatever didn't return usable
    // AI output (model schema variance / a transient failure), budget permitting.
    leftover = await runPool(eligible);
    if (leftover.length && !overBudget()) {
      await appendScanLog(scanId, "INFO", `Re-enriching ${leftover.length} finding(s) that didn't return usable AI output…`);
      leftover = await runPool(leftover);
    }
  } else {
    bump("no_provider", eligible.length);
  }

  // Deterministic floor: anything still unenriched after retries + over the ceiling.
  for (const item of [...leftover, ...overCap]) await applyFallback(item);
  const fallbackCount = leftover.length + overCap.length;
  if (overCap.length) bump("capped", overCap.length);

  // Honest, COUNT-based message — only when something wasn't AI-enriched.
  if (fallbackCount > 0) {
    const dist = Object.entries(reasons).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => `${k}×${n}`).join(", ");
    await appendScanLog(scanId, "WARN", `AI-enriched ${enrichedCount} of ${misses.length} findings; the remaining ${fallbackCount} used deterministic explanations${dist ? ` (${dist})` : ""}.`);
  } else if (enrichedCount > 0) {
    await appendScanLog(scanId, "INFO", `AI-enriched all ${enrichedCount} of ${misses.length} findings.`);
  }
  return { batches: totalBatches, enriched: enrichedCount, fallbackCount, skipped: overCap.length, reasons, providersUsed: [...providersUsed] };
}

async function updateFinding(id: string, enrichment: Enrichment) {
  await db.query(
    `update findings set summary=$2, why_mantle=$3, exploit_scenario=$4, recommended_fix=$5, patch_diff=$6, confidence=$7, gas_impact=$8 where id=$1`,
    [id, enrichment.summary, enrichment.why_mantle, enrichment.exploit_scenario, enrichment.recommended_fix, enrichment.patch_diff, enrichment.confidence, enrichment.gas_impact ?? null],
  );
}

export async function enrichFindingsForScan(scanId: string) {
  const result = await db.query<FindingRow>(
    `select id, severity, category, title, file, line_start, line_end, code_snippet, summary, recommended_fix
     from findings where scan_id = $1 order by sort_index nulls last, id`,
    [scanId],
  );
  const misses: Array<{ finding: FindingRow; key: string }> = [];
  let hits = 0;
  for (const finding of result.rows) {
    const cached = await fetchCache(finding);
    if (cached.enrichment) {
      hits += 1;
      await updateFinding(finding.id, cached.enrichment);
    } else {
      misses.push({ finding, key: cached.key });
    }
  }
  if (hits) await appendScanLog(scanId, "INFO", `ai_cache hit for ${hits}/${result.rows.length} finding enrichment(s)`);
  const { chain, reason } = providerChain();
  const primary = chain[0] ?? null;
  if (misses.length) {
    const tail = chain.slice(1).map((p) => p.label).join(" → ");
    await appendScanLog(
      scanId,
      primary ? "INFO" : "WARN",
      primary
        ? `AI enrichment provider: ${primary.label} (${primary.model})${tail ? ` — failover → ${tail} → deterministic` : ""} — ${reason}.`
        : `AI enrichment provider: none — ${reason}.`,
    );
  }
  const batchResult = misses.length ? await enrichMisses(scanId, chain, misses) : { batches: 0, enriched: 0, fallbackCount: 0, skipped: 0, providersUsed: [] as string[] };
  return { total: result.rows.length, hits, misses: misses.length, provider: primary?.id ?? null, ...batchResult, timeoutMs: CALL_TIMEOUT_MS };
}
