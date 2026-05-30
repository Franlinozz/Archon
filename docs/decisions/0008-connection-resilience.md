# ADR 0008: Production connection resilience (DB pool + Redis + error boundaries)

Status: accepted
Date: 2026-05-30

## Context

The deployed app intermittently returned server-side 500s on every data-touching page
(`/app` digest 294585111, `/app/proofs` digest 97376367, plus `/app/findings`, `/app/tests`,
`/app/reports/*`) while static pages stayed fine. Audit Studio failed with "Unable to create
scan." Root causes, confirmed from prod logs and live probes:

1. **Wedged Postgres pool.** A long-lived `pg.Pool` against the Supabase **transaction pooler**
   (pgBouncer, `aws-0-eu-west-1.pooler.supabase.com:6543`) accumulated connections that the
   pooler had closed server-side. node-pg kept them as idle-alive; the next use timed out with
   `timeout exceeded when trying to connect`, and the pool never recovered without a restart.
   Earlier hardening (keepAlive, query_timeout, maxLifetimeSeconds) reduced but did not eliminate
   re-wedging over ~8h. A fresh standalone connection always succeeded in ~250ms, proving the DB,
   credentials, and network were healthy — only the in-process pool was bad.
2. **Worker crash on Redis blip.** `lib/queue/redis.ts` created an ioredis client with no `'error'`
   listener. On `ECONNREFUSED 127.0.0.1:6379` the unhandled `'error'` event crashed the process
   (`ELIFECYCLE Command failed`), relying on PM2 to restart it.
3. **No error boundaries.** A single failed `db.query` in any server component produced a full 500
   page — there was no `error.tsx` anywhere in the app.

The VPS is **IPv4-only** (`curl -6` egress fails). Supabase **direct** connections (port 5432) are
IPv6-only and would fail outright; the **transaction pooler (6543)** is mandatory here.

## Decision

- **Self-healing query layer.** All call sites use `db.query(...)` (no manual client checkout /
  transactions anywhere — verified). `lib/db/client.ts` now routes `query` through a wrapper that,
  on a connection-class error (matched by SQLSTATE `08xxx`/`57P01` or message), tears down the pool
  (`resetPool`, concurrency-collapsed) and retries exactly once on fresh connections. A genuinely
  down DB still throws after the retry (handled by boundaries); a transient pooler blip self-heals
  on the next call instead of staying wedged.
- **Pool tuned for pgBouncer.** `idleTimeoutMillis` lowered to 10s (we drop idle sockets before the
  pooler does, so we never hold one it already closed), `connectionTimeoutMillis` 5s, keepAlive on,
  `maxLifetimeSeconds` 600. A startup guard logs a warning if `DATABASE_URL` is not the 6543 pooler.
- **Pool sizing.** `DB_POOL_MAX` per process via PM2 env: web `6` + worker `4` = **10 total**, well
  under the Supabase pooler ceiling, leaving headroom for the CLI/ad-hoc connections. Supersedes the
  flat `max: 10` from ADR 0002.
- **Redis resilience.** `'error'`/`'reconnecting'`/`'ready'` listeners + `retryStrategy`
  (capped 200ms→5s backoff) + `reconnectOnError`. The worker adds a `'error'` handler and
  `unhandledRejection`/`uncaughtException` guards that log and stay up. Connection blips now
  reconnect transparently instead of exiting.
- **Fail-fast on the request path.** Because `maxRetriesPerRequest: null` makes ioredis buffer
  commands in an offline queue (good for the worker, fatal for request latency), `pingRedis()`
  returns `false` immediately unless `redis.status === "ready"` and otherwise caps the ping at 2s,
  and `POST /api/scans` pre-checks `redisReady()` plus a 4s enqueue timeout. This keeps
  `/api/health` and scan creation from hanging during a Redis outage.
- **Graceful degradation.** Added `app/app/error.tsx` segment boundary (the `/app` layout is
  data-free, so it renders inside the chrome). The flagship `/app` overview degrades inline with a
  banner and honest "—" KPIs (never fabricated zeros) when its fetch fails.
- **Precise scan-creation errors.** `POST /api/scans` separates DB-insert failure from enqueue
  failure, returns `503` (not `500`) with distinct messages, and marks a scan `failed` if the row
  was created but the queue was unavailable, avoiding orphaned "queued" scans.

## Consequences

- A transient DB/Redis outage now degrades gracefully and recovers without a manual restart.
- Connection-class retries are capped at one per query; persistent outages surface honestly via the
  banner / boundary rather than hanging.
- `DATABASE_URL` must remain the transaction pooler (6543) on this IPv4-only host; the startup guard
  flags a regression. Switching hosts/DB requires revisiting the pool-size math.
