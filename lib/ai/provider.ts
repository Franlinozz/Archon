import { z } from "zod";

// Pluggable AI enrichment providers (R3.1). One interface, three adapters —
// OpenAI, ELFA, and Tencent Cloud Hunyuan (OpenAI-compatible chat completions)
// — selected by env. Adapters whose credentials are absent are INERT and are
// reported as such; nothing here ever pretends an unconfigured provider is live.

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

export type AiProviderId = "openai" | "elfa" | "hunyuan";

export interface AIProvider {
  readonly id: AiProviderId;
  readonly label: string;
  readonly model: string;
  /** True when every credential the adapter needs is present in the environment. */
  configured(): boolean;
  /** What is missing when not configured (env var names only — never values). */
  missing(): string[];
  enrichFindings(findings: EnrichableFinding[], opts?: { timeoutMs?: number }): Promise<BatchResponse>;
}

function stripJsonFences(content: string) {
  return content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
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
      code_snippet: finding.code_snippet,
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
  requires: string[];
};

class ChatCompletionsProvider implements AIProvider {
  constructor(private readonly cfg: ChatCompletionsConfig) {}
  get id() { return this.cfg.id; }
  get label() { return this.cfg.label; }
  get model() { return this.cfg.model(); }

  configured(): boolean {
    return Boolean(this.cfg.apiKey() && this.cfg.baseUrl());
  }

  missing(): string[] {
    return this.cfg.requires.filter((name) => !process.env[name]);
  }

  async enrichFindings(findings: EnrichableFinding[], opts?: { timeoutMs?: number }): Promise<BatchResponse> {
    const apiKey = this.cfg.apiKey();
    const baseUrl = this.cfg.baseUrl();
    if (!apiKey || !baseUrl) throw new Error(`${this.cfg.label} is not configured (${this.missing().join(", ") || "missing endpoint"})`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 45_000);
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.cfg.model(),
          temperature: 0.2,
          ...(this.cfg.jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: "You are a careful smart-contract audit report writer. Output only valid JSON." },
            { role: "user", content: promptFor(findings) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`${this.cfg.label} HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error(`${this.cfg.label} response did not include content`);
      return batchResponseSchema.parse(JSON.parse(stripJsonFences(content)));
    } finally {
      clearTimeout(timeout);
    }
  }
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

// ELFA inference: key alone is not enough to call anything real, so the adapter
// also requires an explicit base URL — guessing an endpoint would burn scan
// latency on guaranteed failures.
const elfa = new ChatCompletionsProvider({
  id: "elfa",
  label: "ELFA",
  baseUrl: () => process.env.ELFA_BASE_URL,
  apiKey: () => process.env.ELFA_API_KEY,
  model: () => process.env.ELFA_MODEL ?? "default",
  jsonMode: false,
  requires: ["ELFA_API_KEY", "ELFA_BASE_URL"],
});

// Tencent Cloud Hunyuan exposes an OpenAI-compatible endpoint; the adapter is
// fully built and activates the moment TENCENT_HUNYUAN_KEY is present.
const hunyuan = new ChatCompletionsProvider({
  id: "hunyuan",
  label: "Tencent Cloud Hunyuan",
  baseUrl: () => process.env.TENCENT_HUNYUAN_BASE_URL ?? "https://api.hunyuan.cloud.tencent.com/v1",
  apiKey: () => process.env.TENCENT_HUNYUAN_KEY,
  model: () => process.env.TENCENT_HUNYUAN_MODEL ?? "hunyuan-turbo",
  jsonMode: true,
  requires: ["TENCENT_HUNYUAN_KEY"],
});

export function providers(): AIProvider[] {
  return [openai, elfa, hunyuan];
}

export type ProviderSelection = { provider: AIProvider | null; source: "env" | "fallback" | "none"; reason: string };

/**
 * AI_PROVIDER wins when that adapter is fully configured; otherwise fall back
 * elfa → openai → none (deterministic templates). The caller logs the choice.
 */
export function selectProvider(): ProviderSelection {
  const requested = process.env.AI_PROVIDER as AiProviderId | undefined;
  if (requested) {
    const match = providers().find((p) => p.id === requested);
    if (match?.configured()) return { provider: match, source: "env", reason: `AI_PROVIDER=${requested}` };
  }
  for (const candidate of [elfa, openai]) {
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
