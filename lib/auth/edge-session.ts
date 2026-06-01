// Edge-runtime SIWE session verification (for middleware). Uses Web Crypto so it
// runs on the Edge runtime, and is byte-compatible with the node:crypto HMAC in
// lib/auth/session.ts (same secret, same base64url(HMAC-SHA256(body))).

const SESSION_COOKIE = "archon_siwe";

function edgeSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV !== "production") return "archon-dev-insecure-session-secret";
  // In prod with no secret we cannot verify; treat everyone as unauthenticated.
  return "";
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToString(s: string): string {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = t.length % 4;
  if (pad) t += "=".repeat(4 - pad);
  return atob(t);
}

export { SESSION_COOKIE };

export async function verifyEdgeSession(token: string | undefined): Promise<{ address: string } | null> {
  if (!token) return null;
  const secret = edgeSecret();
  if (!secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    if (bytesToB64Url(new Uint8Array(mac)) !== sig) return null;
    const payload = JSON.parse(b64UrlToString(body)) as { address?: string; exp?: number };
    if (!payload.address || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { address: payload.address };
  } catch {
    return null;
  }
}
