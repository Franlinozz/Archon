# ADR 0002: Database access

Status: accepted

Decision: Use a raw `pg` Pool with `max: 10`, exported as one shared process-level instance from `lib/db/client.ts`.

Reason: The worker needs direct SQL access and predictable pooling. The Supabase transaction pooler handles connection fan-out; one shared `pg` pool avoids per-request clients and matches the Phase 0 plan.
