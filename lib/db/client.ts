import pg from "pg";
const { Pool } = pg;
let pool: pg.Pool | undefined;
function poolConfigFromUrl(connectionString: string): pg.PoolConfig {
  const url = new URL(connectionString);
  return {
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.replace(/^\//, "") || "postgres",
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: url.hostname.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  };
}

export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  pool ??= new Pool(poolConfigFromUrl(connectionString));
  return pool;
}
export const db = new Proxy({} as pg.Pool, { get(_target, prop) { return Reflect.get(getDb(), prop); } });
export async function pingDb() { const result = await getDb().query<{ ok: number }>("select 1 as ok"); return result.rows[0]?.ok === 1; }
export async function closeDb() { if (pool) await pool.end(); pool = undefined; }
