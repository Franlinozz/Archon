import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Minimal stateless session: an HMAC-signed token in an httpOnly cookie. No DB
// row needed — the signature + expiry are self-validating. Used only to record
// that a wallet completed SIWE; it never holds secrets or authorizes spend.

export const SESSION_COOKIE = "archon_siwe";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

type SessionPayload = { address: string; exp: number };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  // Dev fallback only — production sets SESSION_SECRET in .env.local.
  if (process.env.NODE_ENV !== "production") return "archon-dev-insecure-session-secret";
  throw new Error("SESSION_SECRET must be configured in production.");
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function createSessionToken(address: string, ttlSeconds = TTL_SECONDS): string {
  const payload: SessionPayload = { address: address.toLowerCase(), exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload.address || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

/** Read the current SIWE session (server components / route handlers). */
export async function getSession(): Promise<{ address: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);
  return payload ? { address: payload.address } : null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: TTL_SECONDS,
};
