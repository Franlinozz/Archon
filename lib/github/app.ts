import { createHmac, createSign, timingSafeEqual } from "node:crypto";

// GitHub App plumbing (F3) — zero SDK: RS256 App JWTs, installation tokens
// (cached), HMAC webhook verification, and a small REST helper that respects
// rate limits. INERT until GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY /
// GITHUB_WEBHOOK_SECRET are present; status is reported, never faked.
// The private key only ever lives in env and is never logged.

const API = "https://api.github.com";

export function githubAppConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_WEBHOOK_SECRET);
}

export function githubAppStatus() {
  return {
    id: "github-app",
    label: "Archon for Mantle (GitHub App)",
    configured: githubAppConfigured(),
    status: githubAppConfigured() ? "active" : "inert — pending app registration",
    missingEnv: ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET"].filter((k) => !process.env[k]),
  };
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

function privateKey(): string {
  return (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
}

/** Short-lived RS256 App JWT (GitHub caps validity at 10 minutes). */
export function appJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 30, exp: now + 540, iss: process.env.GITHUB_APP_ID }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey(), "base64url")}`;
}

const tokenCache = new Map<number, { token: string; expiresAt: number }>();

export async function installationToken(installationId: number): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt - Date.now() > 120_000) return cached.token;
  const res = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { authorization: `Bearer ${appJwt()}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`installation token failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json() as { token: string; expires_at: string };
  tokenCache.set(installationId, { token: body.token, expiresAt: new Date(body.expires_at).getTime() });
  return body.token;
}

/** REST helper: one retry on secondary-rate-limit with the advertised wait. */
export async function gh<T = unknown>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 403 || res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? 0);
      if (attempt === 0 && retryAfter > 0 && retryAfter <= 60) { await new Promise((r) => setTimeout(r, retryAfter * 1000)); continue; }
    }
    if (!res.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.status === 204 ? (undefined as T) : (await res.json() as T);
  }
  throw new Error(`GitHub ${method} ${path}: rate limited`);
}

/** Constant-time X-Hub-Signature-256 verification. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Fetch a repo file's text content at a ref; null when absent. */
export async function repoFile(token: string, owner: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const res = await gh<{ content?: string; encoding?: string }>(token, "GET", `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`);
    return res.content ? Buffer.from(res.content, "base64").toString("utf8") : null;
  } catch {
    return null;
  }
}
