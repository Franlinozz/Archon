# ADR 0012: SIWE sign-in required for the workspace (public/gated split)

Status: accepted
Date: 2026-06-01

## Context

Amendment B (locked) resolves the earlier open question: the internal app **requires**
a signed-in SIWE session. Connecting + the free signature is the entry gate to `/app/*`.
This must not hide the judge-facing trust surfaces.

## Decision

- **Server-side gate** in `middleware.ts` (matcher `/app`, `/app/:path*`): verify the
  `archon_siwe` cookie. No valid session → 307 redirect to `/connect?next=<intended>`.
  Verification uses `lib/auth/edge-session.ts` (Web Crypto HMAC, byte-compatible with the
  node `lib/auth/session.ts` signer) so it runs on the Edge runtime.
- **Public (no wallet):** `/`, `/docs`, `/proofs` (the read-only proof index added in the
  prior ship), `/r/[reportId]` (per-report verifier), `/connect`, all `/api/*`, and assets.
  These are simply not matched by the middleware. A judge can read everything and open a
  real anchored proof with no wallet — the trustless thesis is preserved (guardrail B.4).
- **/connect** screen: Archon mark + "free signature, no gas, no transaction" explainer +
  one-click Connect → SiweProvider auto-signs → redirect to `?next` (sanitized to internal
  paths, default `/app`); inline Switch-to-Mantle when on the wrong network; a "back to
  home" link so users are never trapped.
- **Low friction:** the 7-day httpOnly cookie + the hydration-gated SiweProvider mean a
  returning user with a valid session is silently re-authed (no re-prompt) — see the prior
  ship's re-prompt fix.

## Consequences

- `/app/*` cannot be browsed without signing in (the locked requirement). Public verification
  remains fully open.
- The middleware cookie check is cryptographic (HMAC), not mere presence; a forged cookie
  fails both the gate and any session-validated action.
- If `SESSION_SECRET` is ever missing in production, the edge verifier returns null →
  everyone is sent to `/connect` (fail-closed), and node sign-in also refuses — so the gate
  never silently opens. (Secret is set in `.env.local` on the VPS.)
