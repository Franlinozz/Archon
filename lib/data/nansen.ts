// Nansen — EXTERNAL MARKET-DATA enrichment, NOT an LLM/AI provider.
//
// This is deliberately separated from lib/ai/provider.ts: Nansen is a
// crypto/market *data* API (smart-money flows, token screener), so it can never
// be part of the AI enrichment/fallback chain (that is exactly the mistake ELFA
// represented). It is env-gated and inert until NANSEN_API_KEY is present.
//
// Coverage caveat (verified 2026-06-14): the token-screener accepts `mantle` as
// a chain but returns no data for it — Nansen's smart-money dataset covers
// ethereum / solana / base, not Mantle. So there is no honest *live Mantle*
// feature to surface yet; this client is ready infrastructure for a future
// cross-chain surface (or whenever Nansen adds Mantle coverage). Never render
// empty Nansen data as a live Mantle signal.

const BASE = "https://api.nansen.ai/api/v1";

export function nansenConfigured(): boolean {
  return Boolean(process.env.NANSEN_API_KEY);
}

export type TokenScreenerRow = {
  chain: string;
  token_address: string;
  token_symbol: string;
  market_cap_usd: number | null;
  liquidity: number | null;
  netflow: number | null;
};

export type TokenScreenerOpts = {
  chains: string[];
  timeframe?: "24h" | "7d" | "30d";
  onlySmartMoney?: boolean;
  perPage?: number;
  timeoutMs?: number;
};

/**
 * Smart-money token screener. Returns null when unconfigured (never throws for a
 * missing key — the caller treats absence as "feature off", like every other
 * inert adapter). Mantle currently returns an empty set; see the coverage note.
 */
export async function tokenScreener(opts: TokenScreenerOpts): Promise<{ data: TokenScreenerRow[] } | null> {
  const apiKey = process.env.NANSEN_API_KEY;
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(`${BASE}/token-screener`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", apiKey },
      body: JSON.stringify({
        chains: opts.chains,
        timeframe: opts.timeframe ?? "24h",
        filters: { only_smart_money: opts.onlySmartMoney ?? true },
        order_by: [{ field: "netflow", direction: "DESC" }],
        pagination: { page: 1, per_page: opts.perPage ?? 50 },
      }),
    });
    if (!res.ok) throw new Error(`Nansen HTTP ${res.status}`);
    return (await res.json()) as { data: TokenScreenerRow[] };
  } finally {
    clearTimeout(timer);
  }
}

/** Secret-free status for /api/providers (external data, never an AI provider). */
export function nansenStatus() {
  return {
    id: "nansen",
    label: "Nansen (external market data)",
    kind: "external-data" as const,
    configured: nansenConfigured(),
    status: nansenConfigured() ? "configured" : "inert — pending NANSEN_API_KEY",
    coverage: "ethereum, solana, base — no Mantle smart-money data yet",
    note: "Market-data API, not an LLM. Not part of the AI enrichment chain.",
    missingEnv: nansenConfigured() ? [] : ["NANSEN_API_KEY"],
  };
}
