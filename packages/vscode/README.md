# Archon — Mantle audits & gas (VS Code)

Archon findings as native diagnostics, catalog-safe gas quick fixes, and per-opportunity gas lenses — a thin client of the [Archon public API](https://archonaudit.xyz/docs/platform-api/api-reference).

- **Scan**: command “Archon: Scan current file” (or enable `archon.scanOnSave`). Source is sent to the API exactly like pasting into the Audit Studio; anonymous free-tier caps apply.
- **Diagnostics**: severity-mapped squiggles with the finding title + summary; click the code link for the full public report.
- **Quick fixes**: catalog-**safe** gas patches apply as local buffer edits (exact-match `oldText → newText`); you review and save — nothing is auto-committed or pushed.
- **Gas lens**: a file-level lens totaling estimated L2 gas savings + one lens per opportunity at its line (all values labeled estimates; DA priced from receipt ground truth server-side).
- **Offline**: API problems show a quiet status-bar state — never popups.

Read-only by design. Docs: <https://archonaudit.xyz/docs/platform-api/editor-integration>
