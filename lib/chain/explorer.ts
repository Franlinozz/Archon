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

export type VerifiedFile = { path: string; source: string };
// `source` = the entry (main contract) file content, used for hashing/display and as
// the compile target; `files` = the FULL verified bundle (>1 for multi-file contracts)
// so dependency imports like "../utils/Context.sol" resolve in the workspace.
export type VerifiedSource = { source: string; contractName: string | null; files: VerifiedFile[] };

const cache = new Map<string, { value: VerifiedSource; at: number }>();

function apiBase() {
  return process.env.ETHERSCAN_API_BASE ?? DEFAULT_BASE;
}

/** True when the V2 fetch can even be attempted (key present). */
export function explorerConfigured(): boolean {
  return Boolean(process.env.ETHERSCAN_API_KEY);
}

/** Parse Etherscan's SourceCode field — flat source, `{{ standard-json-input }}`, or a
 *  `{ path: {content} }` map — into the full file bundle plus the entry (main contract)
 *  file. Returning every file (not just the first) is what lets multi-file verified
 *  contracts compile: their dependency siblings (e.g. utils/Context.sol) come along. */
function extractVerifiedFiles(raw: string, contractName: string | null): { files: VerifiedFile[]; entry: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fromMap = (obj: unknown): VerifiedFile[] => {
    const sources = (obj as { sources?: Record<string, { content?: string }> })?.sources ?? (obj as Record<string, { content?: string }>);
    if (!sources || typeof sources !== "object") return [];
    return Object.entries(sources)
      .filter(([, v]) => typeof (v as { content?: unknown })?.content === "string")
      .map(([p, v]) => ({ path: p, source: (v as { content: string }).content }));
  };

  let files: VerifiedFile[] = [];
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    try { files = fromMap(JSON.parse(trimmed.slice(1, -1))); } catch { return null; }
  } else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try { files = fromMap(JSON.parse(trimmed)); } catch { /* not a bundle — treat as flat below */ }
  }
  if (!files.length) {
    const name = contractName && /^[A-Za-z_]\w*$/.test(contractName) ? contractName : "Contract";
    files = [{ path: `${name}.sol`, source: trimmed }];
  }
  return { files, entry: pickEntryFile(files, contractName).source };
}

/** The file to analyze: the one declaring ContractName, else the project's own
 *  (non-dependency) file, else the last/first — never a vendored dep if avoidable. */
function pickEntryFile(files: VerifiedFile[], contractName: string | null): VerifiedFile {
  if (contractName && /^[A-Za-z_]\w*$/.test(contractName)) {
    const byName = files.find((f) => f.path === `${contractName}.sol` || f.path.endsWith(`/${contractName}.sol`));
    if (byName) return byName;
    const decl = new RegExp(`\\b(?:contract|library|interface)\\s+${contractName}\\b`);
    const byDecl = files.find((f) => decl.test(f.source));
    if (byDecl) return byDecl;
  }
  const isDep = (p: string) => p.startsWith("@") || p.includes("node_modules/") || p.startsWith("lib/");
  const own = files.filter((f) => !isDep(f.path));
  // Main contract is usually defined after its deps/interfaces → prefer the last own file.
  return own[own.length - 1] ?? files[files.length - 1] ?? files[0]!;
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
      const contractName = entry?.ContractName?.trim() || null;
      const extracted = extractVerifiedFiles(raw, contractName);
      if (!extracted) throw new ExplorerError("not-verified", "Verified entry present but no Solidity content could be extracted.");
      const value: VerifiedSource = { source: extracted.entry, contractName, files: extracted.files };
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
