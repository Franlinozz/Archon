import { z } from "zod";

// Pluggable AI enrichment providers (R3.1). One interface, two adapters —
// OpenAI and Tencent Cloud TokenHub (Tencent's MaaS, OpenAI-compatible chat
// completions) — selected by env, with runtime failover (primary → the other
// configured provider → deterministic templates). Adapters whose credentials
// are absent are INERT and reported as such; nothing here pretends an
// unconfigured provider is live. HONESTY: TokenHub *serves* third-party
// reasoning models (minimax-m3, glm, deepseek); it is NOT a Hunyuan model, so
// labels say "served on Tencent Cloud TokenHub", never "powered by Hunyuan".
// (ELFA was removed — it is a market-data API, not an LLM; see note below.)

export const FINDING_ENRICHMENT_PROMPT_VERSION = "finding-enrichment-v1-2026-05-22";

export const enrichmentSchema = z.object({
  summary: z.coerce.string().min(20).max(900),
  why_mantle: z.coerce.string().min(20).max(900),
  exploit_scenario: z.coerce.string().min(20).max(900),
  recommended_fix: z.coerce.string().min(20).max(1200),
  patch_diff: z.coerce.string().min(10).max(5000),
  confidence: z.coerce.number().min(0).max(1).catch(0.74),
  gas_impact: z.coerce.string().nullable().optional().catch(null),
});

export const batchResponseSchema = z.object({
  findings: z.array(z.object({ id: z.string().uuid(), enrichment: enrichmentSchema })),
});

export type Enrichment = z.infer<typeof enrichmentSchema>;
export type BatchResponse = z.infer<typeof batchResponseSchema>;

export type EnrichableFinding = {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string | null;
};

export type AiProviderId = "openai" | "tokenhub";

export type EnrichmentErrorKind =
  | "timeout"
  | "rate_limit"
  | "server_error"
  | "auth"
  | "http"
  | "json_parse"
  | "schema"
  | "empty"
  | "network"
  | "unknown";

/**
 * Classified enrichment failure (V5.3) so the caller can log *why* a batch fell
 * back to deterministic templates instead of an opaque "timed out or failed".
 * A near-empty/low-tier key presents as `rate_limit` or `auth`; a slow endpoint
 * as `timeout`; a chatty model as `json_parse`/`schema`.
 */
export class EnrichmentError extends Error {
  constructor(readonly kind: EnrichmentErrorKind, message: string) {
    super(message);
    this.name = "EnrichmentError";
  }
}

export function enrichmentErrorKind(err: unknown): EnrichmentErrorKind {
  if (err instanceof EnrichmentError) return err.kind;
  if (err instanceof Error) {
    if (err.name === "AbortError") return "timeout";
    if (err instanceof SyntaxError) return "json_parse";
  }
  return "unknown";
}

// V5.3: per-request budget raised 45s → 75s; the stage stays hard-bounded
// because each call has its own AbortController and retries are capped (see
// enrichFindings) — total ≤ batches × (attempts × timeout + backoff).
export const DEFAULT_ENRICHMENT_TIMEOUT_MS = 75_000;
const MAX_ATTEMPTS = 2; // one retry, transient (429/5xx) only
const RETRY_BACKOFF_MS = 1_200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyStatus(status: number): EnrichmentErrorKind {
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server_error";
  if (status === 401 || status === 403) return "auth";
  return "http";
}

export interface AIProvider {
  readonly id: AiProviderId;
  readonly label: string;
  readonly model: string;
  /** Findings per call. Slow reasoning models (TokenHub) need a small batch to stay
   *  inside the per-call timeout; fast models (OpenAI) batch larger. Undefined → default. */
  readonly batchSize?: number;
  /** True when every credential the adapter needs is present in the environment. */
  configured(): boolean;
  /** What is missing when not configured (env var names only — never values). */
  missing(): string[];
  enrichFindings(findings: EnrichableFinding[], opts?: { timeoutMs?: number }): Promise<BatchResponse>;
}

function stripJsonFences(content: string) {
  // Reasoning models served on TokenHub (e.g. minimax-m3) prepend a
  // <think>…</think> block before the JSON; strip it (and an unclosed leading
  // <think> if the model truncated) so the payload parses, then strip ``` fences.
  let c = content.trim().replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (/^<think>/i.test(c)) c = c.replace(/^<think>[\s\S]*$/i, "").trim();
  return c.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

// V5.3: send only a tight code window per finding, never a whole file. Smaller
// prompts are faster, cheaper, and far less likely to time out. The detector
// already localizes the issue, so the model never needs the full source.
function tightSnippet(snippet: string | null, maxLines = 18, maxChars = 700): string | null {
  if (!snippet) return snippet;
  let text = snippet.replace(/\r/g, "");
  const lines = text.split("\n");
  if (lines.length > maxLines) text = `${lines.slice(0, maxLines).join("\n")}\n… (snippet truncated)`;
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}…`;
  return text;
}

function promptFor(findings: EnrichableFinding[]) {
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
      code_snippet: tightSnippet(finding.code_snippet),
    }))),
  ].join("\n");
}

type ChatCompletionsConfig = {
  id: AiProviderId;
  label: string;
  baseUrl: () => string | undefined;
  apiKey: () => string | undefined;
  model: () => string;
  /** Whether the endpoint accepts OpenAI's response_format json_object hint. */
  jsonMode: boolean;
  /** Findings per call (slow reasoning models need a small batch). */
  batchSize?: number;
  requires: string[];
};

class ChatCompletionsProvider implements AIProvider {
  constructor(private readonly cfg: ChatCompletionsConfig) {}
  get id() { return this.cfg.id; }
  get label() { return this.cfg.label; }
  get model() { return this.cfg.model(); }
  get batchSize() { return this.cfg.batchSize; }

  configured(): boolean {
    return Boolean(this.cfg.apiKey() && this.cfg.baseUrl());
  }

  missing(): string[] {
    return this.cfg.requires.filter((name) => !process.env[name]);
  }

  async enrichFindings(findings: EnrichableFinding[], opts?: { timeoutMs?: number }): Promise<BatchResponse> {
    const apiKey = this.cfg.apiKey();
    const baseUrl = this.cfg.baseUrl();
    if (!apiKey || !baseUrl) throw new EnrichmentError("empty", `${this.cfg.label} is not configured (${this.missing().join(", ") || "missing endpoint"})`);
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_ENRICHMENT_TIMEOUT_MS;
    const body = JSON.stringify({
      model: this.cfg.model(),
      temperature: 0.2,
      ...(this.cfg.jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: "You are a careful smart-contract audit report writer. Output only valid JSON." },
        { role: "user", content: promptFor(findings) },
      ],
    });

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // The abort timer covers the fetch AND the body read (clearTimeout only fires
      // in `finally`), so a response that stalls mid-body can't hang the stage past
      // timeoutMs — this preserves the R1.2 no-hang guarantee across retries.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response: Response;
        try {
          response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            signal: controller.signal,
            headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
            body,
          });
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") throw new EnrichmentError("timeout", `${this.cfg.label} timed out after ${timeoutMs}ms`);
          throw new EnrichmentError("network", `${this.cfg.label} request failed: ${(err as Error).message?.slice(0, 200) ?? "unknown"}`);
        }

        if (!response.ok) {
          const kind = classifyStatus(response.status);
          const transient = kind === "rate_limit" || kind === "server_error";
          if (transient && attempt < MAX_ATTEMPTS) {
            const retryAfter = Number(response.headers.get("retry-after"));
            await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, timeoutMs) : RETRY_BACKOFF_MS * attempt);
            continue;
          }
          throw new EnrichmentError(kind, `${this.cfg.label} HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
        }

        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = payload.choices?.[0]?.message?.content;
        if (!content) throw new EnrichmentError("empty", `${this.cfg.label} response did not include content`);
        let raw: unknown;
        try {
          raw = JSON.parse(stripJsonFences(content));
        } catch {
          throw new EnrichmentError("json_parse", `${this.cfg.label} returned content that was not valid JSON`);
        }
        return tolerantBatch(raw);
      } catch (err) {
        // A timer-fired abort during the body read surfaces as a raw AbortError;
        // classify it as a timeout. Already-classified EnrichmentErrors pass through.
        if (err instanceof Error && err.name === "AbortError") throw new EnrichmentError("timeout", `${this.cfg.label} timed out after ${timeoutMs}ms`);
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new EnrichmentError("unknown", `${this.cfg.label} exhausted ${MAX_ATTEMPTS} attempts`);
  }
}

/**
 * Parse a batch response per-finding: a single malformed enrichment is omitted
 * (the caller applies a deterministic fallback for *that* finding's id only)
 * instead of throwing away the whole batch. A missing `findings` array is a real
 * schema failure (the model ignored the contract) and falls the batch back.
 */
function tolerantBatch(raw: unknown): BatchResponse {
  const arr = (raw as { findings?: unknown } | null)?.findings;
  if (!Array.isArray(arr)) throw new EnrichmentError("schema", "response did not include a findings array");
  const findings: BatchResponse["findings"] = [];
  for (const item of arr) {
    const id = (item as { id?: unknown } | null)?.id;
    if (typeof id !== "string") continue;
    const parsed = enrichmentSchema.safeParse((item as { enrichment?: unknown }).enrichment);
    if (parsed.success) findings.push({ id, enrichment: parsed.data });
  }
  return { findings };
}

const openai = new ChatCompletionsProvider({
  id: "openai",
  label: "OpenAI",
  baseUrl: () => "https://api.openai.com/v1",
  apiKey: () => process.env.OPENAI_API_KEY,
  model: () => process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  jsonMode: true,
  requires: ["OPENAI_API_KEY"],
});

// NOTE: ELFA was removed from the AI provider chain (2026-06-14). ELFA is a
// crypto/market DATA API, not an LLM — pointing the chat-completions adapter at
// it 404s every batch and could silently win the fallback. If ELFA is ever wired
// back, it must be an "external data enrichment" feature gated behind its own
// env, never an LLM/AI provider in this chain. See lib/data/* if added.

// Tencent Cloud TokenHub (Tencent's MaaS) exposes an OpenAI-compatible endpoint
// that SERVES third-party reasoning models (minimax-m3, glm, deepseek). The
// adapter activates the moment TENCENT_TOKENHUB_KEY is present. The intl TokenHub
// has no Hunyuan reasoning model, so this is deliberately NOT branded Hunyuan.
const tokenhub = new ChatCompletionsProvider({
  id: "tokenhub",
  label: "Tencent Cloud TokenHub",
  baseUrl: () => process.env.TENCENT_TOKENHUB_BASE_URL ?? "https://tokenhub-intl.tencentcloudmaas.com/v1",
  apiKey: () => process.env.TENCENT_TOKENHUB_KEY,
  // deepseek-v4-pro chosen by eval: ~19s/finding, schema-clean, no fabrication.
  // minimax-m3 (~61s/finding) and glm-5.1 (timeout) were too slow at any batch.
  model: () => process.env.TENCENT_TOKENHUB_MODEL ?? "deepseek-v4-pro",
  jsonMode: true,
  // Reasoning models are slow → 2 findings/call keeps each request well under the
  // 75s budget; OpenAI failover catches any outlier that still times out.
  batchSize: Number(process.env.TENCENT_TOKENHUB_BATCH_SIZE ?? 2),
  requires: ["TENCENT_TOKENHUB_KEY"],
});

export function providers(): AIProvider[] {
  return [openai, tokenhub];
}

export type ProviderSelection = { provider: AIProvider | null; source: "env" | "fallback" | "none"; reason: string };

/**
 * Ordered providers to try at runtime (option C failover): the selected primary,
 * then any OTHER configured provider as a LIVE fallback, before the deterministic
 * floor. The failover tail is only built when a provider was explicitly requested
 * via AI_PROVIDER — so rollback (unset AI_PROVIDER) returns to single-provider
 * (OpenAI) behavior unchanged.
 */
export function providerChain(): { chain: AIProvider[]; primarySource: ProviderSelection["source"]; reason: string } {
  const primary = selectProvider();
  if (!primary.provider) return { chain: [], primarySource: primary.source, reason: primary.reason };
  const chain = [primary.provider];
  if (primary.source === "env") {
    for (const p of providers()) {
      if (p.id !== primary.provider.id && p.configured()) chain.push(p);
    }
  }
  return { chain, primarySource: primary.source, reason: primary.reason };
}

/**
 * AI_PROVIDER wins when that adapter is fully configured; otherwise fall back
 * openai → none (deterministic templates). The caller logs the choice.
 */
export function selectProvider(): ProviderSelection {
  const requested = process.env.AI_PROVIDER as AiProviderId | undefined;
  if (requested) {
    const match = providers().find((p) => p.id === requested);
    if (match?.configured()) return { provider: match, source: "env", reason: `AI_PROVIDER=${requested}` };
  }
  for (const candidate of [openai]) {
    if (candidate.configured()) {
      return { provider: candidate, source: "fallback", reason: requested ? `AI_PROVIDER=${requested} not configured; fell back to ${candidate.id}` : `default chain selected ${candidate.id}` };
    }
  }
  return { provider: null, source: "none", reason: "no AI provider configured — deterministic explanation templates" };
}

/** Public, secret-free status used by /api/providers and the docs page. */
export function providerStatus() {
  const active = selectProvider();
  return {
    active: active.provider ? { id: active.provider.id, label: active.provider.label, model: active.provider.model, via: active.source } : null,
    note: active.provider ? null : active.reason,
    providers: providers().map((p) => ({
      id: p.id,
      label: p.label,
      model: p.model,
      configured: p.configured(),
      status: p.configured() ? (p.id === active.provider?.id ? "active" : "standby") : "inert — pending credentials",
      missingEnv: p.configured() ? [] : p.missing(),
    })),
  };
}
