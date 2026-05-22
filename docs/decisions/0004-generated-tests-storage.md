# 0004 — Store generated tests on reports

Status: accepted
Date: 2026-05-22

## Context

Phase 2 requires completed reports to carry generated Foundry tests and coverage-by-finding data. The MVP only needs one generated test artifact per report, with optional per-finding snippets added later.

## Decision

Use a `reports.tests jsonb` column instead of a separate `report_tests` table.

Shape:

```json
{
  "version": "archon.tests.v1",
  "framework": "foundry",
  "fileName": "test/VaultV2.t.sol",
  "solidityVersion": "0.8.24",
  "code": "...",
  "loc": 123,
  "totalTests": 4,
  "edgeCases": 2,
  "forkMode": "Mantle Mainnet Fork",
  "chainId": 5000,
  "coverage": [{ "findingId": "...", "category": "Reentrancy", "covered": true, "testName": "test_Reentrancy..." }],
  "matrix": [{ "category": "Reentrancy", "testName": "...", "findingIds": ["..."], "status": "generated" }],
  "perFinding": { "findingId": "snippet" }
}
```

## Rationale

- Test artifacts are report-scoped and read-mostly.
- JSON export can whitelist this object without joining another table.
- It keeps the MVP schema smaller while still allowing a later migration to `report_tests` if multiple frameworks/files become first-class.

## Consequences

Updating a per-finding generated test rewrites the JSON blob. This is acceptable for MVP scale and avoids extra relational complexity.
