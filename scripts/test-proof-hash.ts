import { canonicalize, deterministicReportHash } from "../lib/proof/canonical";

const reportA = {
  schema: "archon.proof.metadata.v1",
  report: { id: "r1", riskScore: 96, severityCounts: { high: 3, medium: 2 }, scope: { lineCount: 120, contract: "VaultV2" } },
  findings: [{ id: "f1", title: "Reentrancy", severity: "high" }],
};

const reportB = {
  findings: [{ severity: "high", title: "Reentrancy", id: "f1" }],
  report: { scope: { contract: "VaultV2", lineCount: 120 }, severityCounts: { medium: 2, high: 3 }, riskScore: 96, id: "r1" },
  schema: "archon.proof.metadata.v1",
};

const hashA = deterministicReportHash(reportA);
const hashB = deterministicReportHash(reportB);
if (hashA !== hashB) {
  console.error("proof-hash determinism failed", { hashA, hashB, canonicalA: canonicalize(reportA), canonicalB: canonicalize(reportB) });
  process.exit(1);
}
console.log(`proof-hash determinism ok: ${hashA}`);
