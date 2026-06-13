// Archon MCP tools — thin client of the Archon public API. No local analysis;
// every tool returns the same evidence-classed JSON the API serves. Read-only.
const API = (process.env.ARCHON_API || "https://archonaudit.xyz").replace(/\/$/, "");

async function post(path, body, timeoutMs = 30000) {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
async function get(path) {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(20000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
async function poll(path, done, timeoutSec) {
  const start = Date.now();
  for (;;) {
    const body = await get(path);
    const r = done(body);
    if (r) return body;
    if ((Date.now() - start) / 1000 > timeoutSec) throw new Error(`timed out polling ${path}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
const text = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

export const apiBase = () => API;

export const tools = {
  archon_scan_source: {
    description: "Audit Solidity source with Archon (Mantle-aware static analysis + AI explanations). Returns severity-ranked findings and the public report URL.",
    schema: { source: { type: "string", description: "Solidity source code to audit" } },
    handler: async ({ source }) => {
      const created = await post("/api/scans", { sourceKind: "paste", sourceCode: source, contractLabel: "mcp", scanDepth: "quick", protocols: ["mETH"] });
      const done = await poll(`/api/scans/${created.scanId}`, (b) => (["done", "failed"].includes(b.scan?.status) ? b : null), 240);
      if (done.scan.status === "failed") throw new Error(done.scan.error || "scan failed");
      return text({
        riskScore: done.report?.riskScore ?? null,
        reportUrl: done.report?.id ? `${API}/r/${done.report.id}` : null,
        findings: (done.findings || []).map((f) => ({ severity: f.severity, title: f.title, file: f.file, line: f.lineStart })),
        note: "Risk intelligence, not a safety guarantee.",
      });
    },
  },
  archon_verdict: {
    description: "Get Archon's signed trust verdict for a deployed Mantle contract — risk score, audit freshness, build attestation, open critical/high counts, proof tx. The signature recovers to Archon's ERC-8004 Agent #97 owner key (offline-verifiable provenance).",
    schema: { address: { type: "string", description: "Deployed Mantle Mainnet contract address (0x…)" } },
    handler: async ({ address }) => text(await get(`/api/v1/verdict/5000/${address}`)),
  },
  archon_gas_report: {
    description: "Run Archon's receipt-calibrated Mantle gas report on Solidity source. Returns the L2/DA split (DA priced from receipt ground truth) and ranked optimization opportunities.",
    schema: { source: { type: "string", description: "Solidity source code" }, callsPerYear: { type: "number", description: "Optional annual call volume for savings (default 100000)" } },
    handler: async ({ source, callsPerYear }) => {
      const created = await post("/api/gas/scan", { sourceKind: "paste", sourceCode: source, contractLabel: "mcp", callsPerYear: callsPerYear || undefined });
      const done = await poll(`/api/gas/reports/${created.gasReportId}`, (b) => (["done", "failed"].includes((b.report ?? b).status) ? b : null), 240);
      const report = done.report ?? done;
      if (report.status === "failed") throw new Error(report.error || "gas report failed");
      return text({
        reportUrl: `${API}/app/gas/${report.id}`,
        l2GasSavedPerCall: report.totals?.l2GasSavedPerCall ?? 0,
        split: report.totals?.split ?? null,
        opportunities: (done.optimizations || []).slice(0, 10).map((o) => ({ title: o.title, ruleId: o.ruleId, safety: o.safety, estL2Delta: o.estL2Delta })),
        note: "DA priced from Mantle receipt ground truth; deltas are estimates unless labeled measured.",
      });
    },
  },
  archon_verify_proof: {
    description: "Verify an Archon on-chain proof by report hash — returns the anchored proof record (tx, contract, risk) from the public proofs index, or none if not anchored.",
    schema: { reportHash: { type: "string", description: "Canonical Archon report hash (0x…)" } },
    handler: async ({ reportHash }) => {
      const { proofs } = await get("/api/proofs");
      const match = (proofs || []).find((p) => (p.reportHash || "").toLowerCase() === reportHash.toLowerCase());
      return text(match
        ? { found: true, contractName: match.contractName, riskScore: match.riskScore, txHash: match.txHash, reportId: match.reportId, verify: `${API}/r/${match.reportId}` }
        : { found: false, note: "No anchored proof with that report hash in the public index." });
    },
  },
};
