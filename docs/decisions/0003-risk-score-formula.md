# 0003 — Phase 1 deterministic risk score

Status: accepted
Date: 2026-05-22

## Context

Phase 1 needs a defensible report score before the AI reasoning layer exists. Judges should be able to understand why a score changed from the persisted findings alone.

## Decision

Archon computes risk from severity counts with a simple weighted formula:

```text
base = 12
weighted = critical*28 + high*18 + medium*10 + low*4 + info*1
risk_score = clamp(base + weighted, 1, 100)
```

Severity normalization follows the global severity colors: Critical, High, Medium, Low, Info. Slither `Optimization` findings map to Low because they are useful but usually not safety-critical.

## Rationale

- Reentrancy and other critical/high issues dominate the score.
- Medium issues still move the score materially.
- Informational findings preserve traceability without overwhelming the score.
- The base of 12 avoids a misleading zero-risk result for small scans while keeping low-finding reports low.

## Consequences

The score is deterministic and auditable from `findings` + `severity_counts`. Phase 2 can expose a “How is this calculated?” affordance that links to this formula. Future AI enrichment may improve summaries and confidence, but should not silently rewrite this Phase 1 deterministic score without a new ADR.
