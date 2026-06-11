import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { appendScanLog, publishScanEvent } from "@/lib/scan/events";

export const FINDING_ENRICHMENT_PROMPT_VERSION = "finding-enrichment-v1-2026-05-22";
const MODEL = "gpt-4o-mini";
const BATCH_SIZE = Number(process.env.ARCHON_AI_ENRICHMENT_BATCH_SIZE ?? 5);
const CALL_TIMEOUT_MS = Number(process.env.ARCHON_AI_ENRICHMENT_TIMEOUT_MS ?? 45_000);
const MAX_BATCHES_DEFAULT = Number(process.env.ARCHON_AI_ENRICHMENT_MAX_BATCHES ?? 8);

const enrichmentSchema = z.object({
  summary: z.coerce.string().min(20).max(900),
  why_mantle: z.coerce.string().min(20).max(900),
  exploit_scenario: z.coerce.string().min(20).max(900),
  recommended_fix: z.coerce.string().min(20).max(1200),
  patch_diff: z.coerce.string().min(10).max(5000),
  confidence: z.coerce.number().min(0).max(1).catch(0.74),
  gas_impact: z.coerce.string().nullable().optional().catch(null),
});

const batchResponseSchema = z.object({
  findings: z.array(z.object({ id: z.string().uuid(), enrichment: enrichmentSchema })),
});

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

type Enrichment = z.infer<typeof enrichmentSchema>;
type ScanAiBudget = { lineCount: number; maxBatches: number };

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

function stripJsonFences(content: string) {
  return content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
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

function promptFor(findings: FindingRow[]) {
  return [
    "You enrich deterministic smart-contract audit findings for Archon, a Mantle Mainnet read-only auditor.",
    "Respond with only a JSON object, no prose, no markdown fences.",
    "Do not invent vulnerabilities, files, line numbers, functions, protocols, or facts not present in the provided deterministic finding.",
    "Explain and recommend; do not claim the contract is safe, unsafe, guaranteed exploitable, certified, or fully audited.",
    "Patch diffs must be minimal unified diffs and must only touch the shown file/snippet. If unsure, provide a conservative validation/checks-effects-interactions diff.",
    "Return shape: { findings: [{ id, enrichment: { summary, why_mantle, exploit_scenario, recommended_fix, patch_diff, confidence, gas_impact } }] }.",
    "confidence must be a number from 0 to 1.",
    "Findings:",
    JSON.stringify(findings.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
      file: finding.file,
      line_start: finding.line_start,
      line_end: finding.line_end,
      code_snippet: finding.code_snippet,
    }))),
  ].join("\n");
}

async function callOpenAI(findings: FindingRow[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a careful smart-contract audit report writer. Output only valid JSON." },
          { role: "user", content: promptFor(findings) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI response did not include content");
    return batchResponseSchema.parse(JSON.parse(stripJsonFences(content)));
  } finally {
    clearTimeout(timeout);
  }
}

async function emitAiProgress(scanId: string, batchIndex: number, totalBatches: number) {
  const progress = Math.min(74, 63 + Math.ceil(((batchIndex + 1) / Math.max(1, totalBatches)) * 10));
  await db.query("update scans set progress=$2, current_stage='AI Reasoning' where id=$1 and status='running'", [scanId, progress]);
  await publishScanEvent({ type: "stage", scanId, stage: "AI Reasoning", progress, status: "running", at: new Date().toISOString() });
}

async function enrichMisses(scanId: string, misses: Array<{ finding: FindingRow; key: string }>, budget: ScanAiBudget) {
  const maxFindings = Math.max(0, budget.maxBatches * BATCH_SIZE);
  const eligible = misses.slice(0, maxFindings);
  const skipped = misses.slice(maxFindings);
  const batches: Array<Array<{ finding: FindingRow; key: string }>> = [];
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) batches.push(eligible.slice(i, i + BATCH_SIZE));
  let fallbackCount = 0;

  if (skipped.length) {
    await appendScanLog(scanId, "WARN", `AI enrichment bounded for large contract (${budget.lineCount} lines): deterministic explanations used for ${skipped.length} finding(s) beyond ${budget.maxBatches} timed batch(es).`);
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]!;
    let byId = new Map<string, Enrichment>();
    try {
      const parsed = await callOpenAI(batch.map((item) => item.finding));
      byId = new Map(parsed.findings.map((item) => [item.id, item.enrichment]));
      await appendScanLog(scanId, "INFO", `AI enrichment batch ${batchIndex + 1}/${batches.length}: gpt-4o-mini enriched ${parsed.findings.length}/${batch.length} finding(s).`);
    } catch {
      fallbackCount += batch.length;
      await appendScanLog(scanId, "WARN", `AI enrichment batch ${batchIndex + 1}/${batches.length} timed out or failed; deterministic explanations used for ${batch.length} finding(s).`);
    }

    for (const item of batch) {
      const fallback = fallbackEnrichment(item.finding);
      const enrichment = byId.get(item.finding.id);
      if (!enrichment && byId.size) fallbackCount += 1;
      const safe = enrichmentSchema.catch(fallback).parse(enrichment ?? fallback);
      await storeCache(item.key, safe);
      await updateFinding(item.finding.id, safe);
    }
    await emitAiProgress(scanId, batchIndex, batches.length + (skipped.length ? 1 : 0));
  }

  for (const item of skipped) {
    const safe = fallbackEnrichment(item.finding);
    await storeCache(item.key, safe);
    await updateFinding(item.finding.id, safe);
    fallbackCount += 1;
  }
  if (fallbackCount) await appendScanLog(scanId, "WARN", `AI enrichment partial — deterministic explanations used for ${fallbackCount} finding(s).`);
  return { batches: batches.length, fallbackCount, skipped: skipped.length };
}

async function updateFinding(id: string, enrichment: Enrichment) {
  await db.query(
    `update findings set summary=$2, why_mantle=$3, exploit_scenario=$4, recommended_fix=$5, patch_diff=$6, confidence=$7, gas_impact=$8 where id=$1`,
    [id, enrichment.summary, enrichment.why_mantle, enrichment.exploit_scenario, enrichment.recommended_fix, enrichment.patch_diff, enrichment.confidence, enrichment.gas_impact ?? null],
  );
}

export async function enrichFindingsForScan(scanId: string) {
  const [result, scanResult] = await Promise.all([
    db.query<FindingRow>(
      `select id, severity, category, title, file, line_start, line_end, code_snippet, summary, recommended_fix
       from findings where scan_id = $1 order by sort_index nulls last, id`,
      [scanId],
    ),
    db.query<{ lines: string }>("select coalesce(array_length(string_to_array(source_code, E'\\n'), 1), 0)::text as lines from scans where id=$1", [scanId]),
  ]);
  const lineCount = Number(scanResult.rows[0]?.lines ?? 0);
  const maxBatches = lineCount >= 1500 ? Math.min(MAX_BATCHES_DEFAULT, 4) : MAX_BATCHES_DEFAULT;
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
  const batchResult = misses.length ? await enrichMisses(scanId, misses, { lineCount, maxBatches }) : { batches: 0, fallbackCount: 0, skipped: 0 };
  return { total: result.rows.length, hits, misses: misses.length, ...batchResult, timeoutMs: CALL_TIMEOUT_MS };
}
