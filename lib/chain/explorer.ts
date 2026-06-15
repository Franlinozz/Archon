import { isAddress } from "viem";

// Verified-source / ABI fetch for Mantle Mainnet via the Etherscan **V2 multichain**
// API. The legacy Mantle Blockscout host (explorer.mantle.xyz/api) is dead and the
// per-chain V1 hosts are deprecated ("switch to Etherscan API V2"), so this is the
// single live path. One shared client (used by the gas optimizer, the scan address
// ingest, and Sentinel) with retry-on-transient, a per-address cache, and typed
// errors so callers degrade gracefully (e.g. fall back to pasted source) instead of
// surfacing a raw "HTTP 502".

const DEFAULT_BASE = "https://api.etherscan.io/v2/api";
const MANTLE_CHAIN_ID = 5000;
const CACHE_TTL_MS = 60 * 60 * 1000; // verified source is immutable per address

export type ExplorerErrorKind = "no-key" | "not-verified" | "rate-limit" | "http" | "network" | "bad-input";

export class ExplorerError extends Error {
  constructor(readonly kind: ExplorerErrorKind, message: string) {
    super(message);
    this.name = "ExplorerError";
  }
}

export type VerifiedSource = { source: string; contractName: string | null };

const cache = new Map<string, { value: VerifiedSource; at: number }>();

function apiBase() {
  return process.env.ETHERSCAN_API_BASE ?? DEFAULT_BASE;
}

/** True when the V2 fetch can even be attempted (key present). */
export function explorerConfigured(): boolean {
  return Boolean(process.env.ETHERSCAN_API_KEY);
}

/** Pull the primary Solidity content out of Etherscan's SourceCode field, which is
 *  either flat source, a `{{ standard-json-input }}`, or a `{ path: {content} }` map. */
function extractPrimarySource(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const tryMap = (obj: unknown): string | null => {
    const sources = (obj as { sources?: Record<string, { content?: string }> })?.sources ?? (obj as Record<string, { content?: string }>);
    if (!sources || typeof sources !== "object") return null;
    const entry = Object.values(sources).find((e) => typeof (e as { content?: unknown })?.content === "string") as { content: string } | undefined;
    return entry?.content ?? null;
  };
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    try { return tryMap(JSON.parse(trimmed.slice(1, -1))); } catch { return null; }
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try { const m = tryMap(JSON.parse(trimmed)); if (m) return m; } catch { /* not a json bundle — treat as flat */ }
  }
  return trimmed;
}

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new ExplorerError(res.status === 429 ? "rate-limit" : "http", `Explorer HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err instanceof ExplorerError) throw err;
    if (err instanceof Error && err.name === "AbortError") throw new ExplorerError("network", `Explorer request timed out after ${timeoutMs}ms`);
    throw new ExplorerError("network", `Explorer request failed: ${(err as Error).message?.slice(0, 150) ?? "unknown"}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch verified Solidity source for a Mantle address. Throws a typed ExplorerError
 * on failure so callers can choose graceful degradation. Caches successful fetches.
 */
export async function fetchVerifiedSource(address: string, opts?: { timeoutMs?: number }): Promise<VerifiedSource> {
  if (!isAddress(address)) throw new ExplorerError("bad-input", "Enter a valid Mantle contract address.");
  const addr = address.toLowerCase();
  const hit = cache.get(addr);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) throw new ExplorerError("no-key", "Verified-source lookup needs an Etherscan V2 API key (ETHERSCAN_API_KEY). Paste the contract source instead.");

  const url = `${apiBase()}?chainid=${MANTLE_CHAIN_ID}&module=contract&action=getsourcecode&address=${address}&apikey=${key}`;
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const payload = (await getJson(url, timeoutMs)) as { status?: string; message?: string; result?: Array<{ SourceCode?: string; ContractName?: string }> | string };
      // V2 returns errors (missing key, rate limit) as a `result` string with status "0".
      if (typeof payload.result === "string") {
        if (/rate limit/i.test(payload.result)) throw new ExplorerError("rate-limit", payload.result);
        if (/api key/i.test(payload.result)) throw new ExplorerError("no-key", payload.result);
        throw new ExplorerError("http", payload.result.slice(0, 200));
      }
      const entry = payload.result?.[0];
      const raw = entry?.SourceCode?.trim() ?? "";
      if (!raw) throw new ExplorerError("not-verified", "This address has no verified Solidity source on Mantle.");
      const source = extractPrimarySource(raw);
      if (!source) throw new ExplorerError("not-verified", "Verified entry present but no Solidity content could be extracted.");
      const value: VerifiedSource = { source, contractName: entry?.ContractName?.trim() || null };
      cache.set(addr, { value, at: Date.now() });
      return value;
    } catch (err) {
      lastErr = err;
      const kind = err instanceof ExplorerError ? err.kind : "network";
      if ((kind === "rate-limit" || kind === "network" || kind === "http") && attempt < 2) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      throw err instanceof ExplorerError ? err : new ExplorerError("network", String(err).slice(0, 150));
    }
  }
  throw lastErr instanceof ExplorerError ? lastErr : new ExplorerError("network", "Explorer fetch failed after retries.");
}
