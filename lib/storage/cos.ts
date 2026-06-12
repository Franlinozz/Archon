import { createHash, createHmac } from "node:crypto";
import { logger } from "@/lib/logger";

// Tencent Cloud COS artifact storage adapter (R3.1). Signed PUT against the
// COS XML API — no SDK dependency. Fully built, INERT until all four env vars
// are present; callers treat it as an optional, non-fatal backup target and
// must never describe it as live while unconfigured.

const REQUIRED_ENV = ["TENCENT_COS_SECRET_ID", "TENCENT_COS_SECRET_KEY", "TENCENT_COS_BUCKET", "TENCENT_COS_REGION"] as const;

function env() {
  return {
    secretId: process.env.TENCENT_COS_SECRET_ID,
    secretKey: process.env.TENCENT_COS_SECRET_KEY,
    bucket: process.env.TENCENT_COS_BUCKET,
    region: process.env.TENCENT_COS_REGION,
  };
}

export function cosConfigured(): boolean {
  const cfg = env();
  return Boolean(cfg.secretId && cfg.secretKey && cfg.bucket && cfg.region);
}

export function cosStatus() {
  return {
    id: "tencent-cos",
    label: "Tencent Cloud COS",
    configured: cosConfigured(),
    status: cosConfigured() ? "active" : "inert — pending credentials",
    missingEnv: REQUIRED_ENV.filter((name) => !process.env[name]),
  };
}

const sha1 = (value: string) => createHash("sha1").update(value).digest("hex");
const hmacSha1 = (key: string, value: string) => createHmac("sha1", key).update(value).digest("hex");

/** COS XML API request signature (q-sign-algorithm=sha1), host-only header list. */
function cosAuthorization(method: string, pathname: string, host: string, secretId: string, secretKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + 600}`;
  const signKey = hmacSha1(secretKey, keyTime);
  const httpString = `${method.toLowerCase()}\n${pathname}\n\nhost=${encodeURIComponent(host).toLowerCase()}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);
  return [
    "q-sign-algorithm=sha1",
    `q-ak=${secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    "q-header-list=host",
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
}

export type CosPutResult = { stored: true; url: string; key: string } | { stored: false; reason: string };

export async function putCosObject(key: string, body: string | Buffer, contentType = "application/json"): Promise<CosPutResult> {
  const cfg = env();
  if (!cfg.secretId || !cfg.secretKey || !cfg.bucket || !cfg.region) {
    return { stored: false, reason: `COS not configured (missing ${REQUIRED_ENV.filter((n) => !process.env[n]).join(", ")})` };
  }
  const host = `${cfg.bucket}.cos.${cfg.region}.myqcloud.com`;
  const pathname = `/${key.replace(/^\//, "")}`;
  try {
    const response = await fetch(`https://${host}${pathname}`, {
      method: "PUT",
      headers: {
        host,
        "content-type": contentType,
        authorization: cosAuthorization("put", pathname, host, cfg.secretId, cfg.secretKey),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { stored: false, reason: `COS PUT ${response.status}: ${(await response.text()).slice(0, 300)}` };
    return { stored: true, url: `https://${host}${pathname}`, key: pathname.slice(1) };
  } catch (error) {
    return { stored: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Best-effort backup of a proof/report artifact. Never throws and never blocks
 * the primary IPFS/Postgres path — a failed or unconfigured backup is logged
 * and reported as exactly that.
 */
export async function backupArtifactToCos(key: string, artifact: unknown): Promise<CosPutResult> {
  if (!cosConfigured()) return { stored: false, reason: "COS not configured" };
  const result = await putCosObject(key, JSON.stringify(artifact, null, 2));
  if (result.stored) logger.info({ key: result.key }, "artifact backed up to Tencent COS");
  else logger.warn({ key, reason: result.reason }, "Tencent COS artifact backup failed");
  return result;
}
