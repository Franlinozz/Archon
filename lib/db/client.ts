import pg from "pg";
import { logger } from "@/lib/logger";
const { Pool } = pg;
let pool: pg.Pool | undefined;
let resetting: Promise<void> | null = null;

function poolConfigFromUrl(connectionString: string): pg.PoolConfig {
  const url = new URL(connectionString);
  // Guard rail: Supabase DIRECT connections (port 5432) resolve to IPv6 only. This VPS
  // is IPv4-only, so a direct URL would hang and time out. We require the TRANSACTION
  // POOLER (port 6543). Warn loudly if someone swaps the URL back to direct.
  if (url.hostname.includes("supabase.com") && url.port !== "6543") {
    logger.warn(
      { host: url.hostname, port: url.port },
      "DATABASE_URL is not the Supabase transaction pooler (6543); direct (5432) is IPv6-only and will fail on this IPv4-only host",
    );
  }
  // Total connections are capped across processes via DB_POOL_MAX (web 6 + worker 4 = 10,
  // well under Supabase's pooler ceiling). See ADR 0008.
  const max = Number(process.env.DB_POOL_MAX ?? 6);
  return {
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.replace(/^\//, "") || "postgres",
    max,
    // Close our idle connections quickly — sooner than pgBouncer's own idle timeout — so
    // the pool never keeps a socket the pooler has already dropped server-side. Holding
    // such half-open sockets is what wedged the long-lived pool before.
    idleTimeoutMillis: 10_000,
    // Fail fast when acquiring/opening a connection instead of letting requests hang.
    connectionTimeoutMillis: 5_000,
    // OS-level keepalive surfaces half-open sockets so node-pg can evict them.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // Client-side cap on any single query so a query on a dead socket rejects fast.
    query_timeout: 15_000,
    // Proactively retire connections so a long-lived pool can't accumulate stale sockets.
    maxLifetimeSeconds: 600,
    ssl: url.hostname.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  };
}

export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  if (!pool) {
    const created = new Pool(poolConfigFromUrl(connectionString));
    // Without this listener an idle-client error (server closing a stale connection after
    // a blip) is emitted on the pool as an uncaught error and crashes the process.
    created.on("error", (err) => {
      logger.error({ err: err.message }, "pg pool idle client error; connection evicted");
    });
    pool = created;
  }
  return pool;
}

// Connection-class failures mean the pooled sockets are stale (pgBouncer closed them
// server-side, or a network blip) — not a bad query. node-pg surfaces these by message
// or SQLSTATE; matching both keeps us robust across pg/pgBouncer versions.
const CONNECTION_ERROR_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "57P01", "08006", "08003", "08000"]);
const CONNECTION_ERROR_RE = /timeout exceeded when trying to connect|Connection terminated|connection terminated unexpectedly|server closed the connection|Client has encountered a connection error|read ECONNRESET/i;

function isConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code && CONNECTION_ERROR_CODES.has(e.code)) return true;
  return typeof e.message === "string" && CONNECTION_ERROR_RE.test(e.message);
}

// Tear the pool down so the next call rebuilds fresh connections instead of staying
// wedged until a manual restart. Concurrent callers share one reset.
async function resetPool(): Promise<void> {
  if (resetting) return resetting;
  const dying = pool;
  pool = undefined;
  resetting = (async () => {
    if (dying) {
      try {
        await dying.end();
      } catch {
        /* pool already broken; nothing to clean up */
      }
    }
  })();
  try {
    await resetting;
  } finally {
    resetting = null;
  }
}

// Resilient query: on a connection-class failure, reset the pool and retry exactly once
// on fresh connections. A genuinely-down database still throws after the retry (callers /
// error boundaries handle that), but a transient pooler blip self-heals on the next call.
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<pg.QueryResult<T>> {
  try {
    return await getDb().query<T>(text, values as unknown[] as never);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    logger.warn({ err: (err as Error).message }, "db connection error; resetting pool and retrying once");
    await resetPool();
    return await getDb().query<T>(text, values as unknown[] as never);
  }
}

// All call sites use `db.query(...)`; routing that through the resilient wrapper above
// gives every page/route/worker self-healing for free. Other pool methods pass through.
export const db = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    if (prop === "query") return query;
    return Reflect.get(getDb(), prop);
  },
});

export async function pingDb() {
  const result = await query<{ ok: number }>("select 1 as ok");
  return result.rows[0]?.ok === 1;
}

export async function closeDb() {
  const dying = pool;
  pool = undefined;
  if (dying) await dying.end();
}
