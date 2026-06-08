export const liveExampleIds = {
  auditReportId: "0f1207f2-ff69-4875-b05c-aabdba78a0c7",
  findingId: "7b486085-376a-47b0-a5b6-db5493c89802",
  gasReportId: "68d43d0a-8d65-4cbf-80ef-837ba45524af",
  gasOptimizationId: "9009df9a-7450-4fd2-bdda-870e7042083d",
  proofTxHash: "0x8ba710a80cdc6c466f406e70345803ce993eb04afb07793219617564ca0a8eee",
} as const;

const errorResponse = {
  description: "Error response. Archon returns a stable `error` string and may include validation `issues`.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
};

const uuidParam = (name: string, description: string) => ({ name, in: "path", required: true, description, schema: { type: "string", format: "uuid" } });

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Archon API",
    version: "2.7.0",
    summary: "Mantle-native audit, gas optimization, and proof APIs.",
    description: "Archon's public/platform API for starting Mantle audits, reading reports and findings, running the gas optimizer, applying gas patches, viewing the gas leaderboard, and preparing/verifying on-chain proofs. This spec is hand-authored from the current Next.js route handlers; undocumented internal auth/session/chat/source routes are intentionally excluded.",
  },
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  servers: [
    { url: "https://archonaudit.xyz", description: "Production" },
    { url: "http://localhost:3000", description: "Local development" },
  ],
  tags: [
    { name: "Audit", description: "Queue and read Mantle audit scans and reports." },
    { name: "Findings", description: "Read and generate tests for audit findings." },
    { name: "Gas Optimizer", description: "Queue gas scans, read gas reports, apply patches, and rank leaderboard entries." },
    { name: "Proofs", description: "Prepare, anchor, verify, and list proof records." },
    { name: "Platform", description: "Health and operational platform endpoints." },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["Platform"],
        summary: "Health check",
        description: "Checks database and Redis readiness. Used by deployment and monitoring.",
        responses: {
          "200": { description: "Healthy", content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } } },
          "503": { description: "Degraded", content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } } },
        },
      },
    },
    "/api/scans": {
      post: {
        tags: ["Audit"],
        summary: "Create an audit scan",
        description: "Queues a read-only Mantle audit scan. Pasted source must include a Solidity pragma and at least one contract, and must be under 350 KB.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateScanRequest" }, examples: { paste: { value: { sourceKind: "paste", sourceCode: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\ncontract UploadOk { function ping() external pure returns (uint256) { return 1; } }", scanDepth: "quick", protocols: ["mETH"] } }, address: { value: { sourceKind: "address", sourceRef: "0x0000000000000000000000000000000000000000", scanDepth: "quick", protocols: ["mETH"] } } } } } },
        responses: {
          "201": { description: "Queued", content: { "application/json": { schema: { type: "object", required: ["scanId"], properties: { scanId: { type: "string", format: "uuid" } } } } } },
          "400": errorResponse,
          "503": errorResponse,
        },
      },
    },
    "/api/scans/{id}": {
      get: {
        tags: ["Audit"],
        summary: "Get scan status, findings, logs, and latest report",
        parameters: [uuidParam("id", "Scan id returned by POST /api/scans.")],
        responses: {
          "200": { description: "Scan snapshot", content: { "application/json": { schema: { $ref: "#/components/schemas/ScanSnapshot" } } } },
          "400": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/reports/{id}": {
      get: {
        tags: ["Audit"],
        summary: "Export an audit report",
        description: "Returns the report export shape used by public report pages and proof metadata.",
        parameters: [uuidParam("id", "Audit report id." )],
        responses: {
          "200": { description: "Report export", content: { "application/json": { schema: { $ref: "#/components/schemas/ReportExport" } } } },
          "400": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/reports/{id}/findings/{findingId}/test": {
      post: {
        tags: ["Findings"],
        summary: "Generate a test for a finding",
        description: "Generates a Solidity/Foundry-style test scaffold for a stored finding.",
        parameters: [uuidParam("id", "Audit report id."), uuidParam("findingId", "Finding id.")],
        responses: {
          "200": { description: "Generated test", content: { "application/json": { schema: { type: "object", required: ["ok", "test"], properties: { ok: { type: "boolean", const: true }, test: { type: "string" } } } } } },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },
    "/api/gas/scan": {
      post: {
        tags: ["Gas Optimizer"],
        summary: "Create a gas optimization report",
        description: "Queues a Mantle gas optimization run. Source may be pasted Solidity, the built-in sample, or a verified Mantle address.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateGasScanRequest" }, examples: { paste: { value: { sourceKind: "paste", sourceCode: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\ncontract UploadOk { uint256 public total; function add(uint256 x) external { total += x; } }", callsPerYear: 100000, mntUsd: 1 } }, sample: { value: { sourceKind: "sample", callsPerYear: 100000, mntUsd: 1 } } } } } },
        responses: {
          "202": { description: "Queued gas report", content: { "application/json": { schema: { $ref: "#/components/schemas/GasScanQueued" } } } },
          "400": errorResponse,
          "503": errorResponse,
        },
      },
    },
    "/api/gas/reports/{id}": {
      get: {
        tags: ["Gas Optimizer"],
        summary: "Get a gas report",
        parameters: [uuidParam("id", "Gas report id.")],
        responses: {
          "200": { description: "Gas report with ranked optimizations", content: { "application/json": { schema: { $ref: "#/components/schemas/GasReportResponse" } } } },
          "400": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/gas/reports/{id}/opt/{optId}": {
      get: {
        tags: ["Gas Optimizer"],
        summary: "Get one gas optimization",
        parameters: [uuidParam("id", "Gas report id."), uuidParam("optId", "Gas optimization id.")],
        responses: {
          "200": { description: "Optimization detail", content: { "application/json": { schema: { type: "object", required: ["schema", "optimization"], properties: { schema: { type: "string", const: "archon.gas.optimization.v1" }, optimization: { $ref: "#/components/schemas/GasOptimization" } } } } } },
          "400": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/gas/reports/{id}/apply": {
      post: {
        tags: ["Gas Optimizer"],
        summary: "Queue or retrieve a gas patch application",
        description: "If the patch has already been compiled, returns the cached patched source. Otherwise queues worker-side patch compilation and gas-diff generation.",
        parameters: [uuidParam("id", "Gas report id.")],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["optId"], properties: { optId: { type: "string", format: "uuid" } } }, examples: { live: { value: { optId: liveExampleIds.gasOptimizationId } } } } } },
        responses: {
          "200": { description: "Patch ready", content: { "application/json": { schema: { $ref: "#/components/schemas/GasPatchReady" } } } },
          "202": { description: "Patch queued", content: { "application/json": { schema: { $ref: "#/components/schemas/GasPatchQueued" } } } },
          "400": errorResponse,
          "404": errorResponse,
          "503": errorResponse,
        },
      },
    },
    "/api/gas/reports/{id}/anchor": {
      post: {
        tags: ["Gas Optimizer", "Proofs"],
        summary: "Anchor a gas report proof",
        description: "Requires a wallet session cookie. Anchors a completed gas report through Archon's configured proof registry and returns the transaction details.",
        security: [{ walletSession: [] }],
        parameters: [uuidParam("id", "Gas report id.")],
        responses: {
          "200": { description: "Anchored or already anchored", content: { "application/json": { schema: { $ref: "#/components/schemas/AnchorResult" } } } },
          "400": errorResponse,
          "401": errorResponse,
        },
      },
    },
    "/api/gas/leaderboard": {
      get: {
        tags: ["Gas Optimizer"],
        summary: "Public gas leaderboard data",
        description: "Ranks completed gas reports. Rows are real stored reports; sample scans are labeled with `sourceKind=sample`.",
        parameters: [
          { name: "metric", in: "query", schema: { type: "string", enum: ["score", "savings", "l2", "recent"], default: "score" } },
          { name: "sourceKind", in: "query", schema: { type: "string", enum: ["all", "sample", "paste", "address"], default: "all" } },
          { name: "q", in: "query", schema: { type: "string", maxLength: 120 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
        ],
        responses: {
          "200": { description: "Leaderboard", content: { "application/json": { schema: { $ref: "#/components/schemas/GasLeaderboard" } } } },
          "400": errorResponse,
        },
      },
    },
    "/api/reports/{id}/proof": {
      post: {
        tags: ["Proofs"],
        summary: "Prepare proof metadata and self-custody params",
        description: "Creates or updates prepared proof metadata for a completed audit report. Does not require a wallet session.",
        parameters: [uuidParam("id", "Audit report id.")],
        responses: {
          "200": { description: "Prepared proof", content: { "application/json": { schema: { $ref: "#/components/schemas/PreparedProof" } } } },
          "400": errorResponse,
        },
      },
      patch: {
        tags: ["Proofs"],
        summary: "Log or verify an audit proof",
        description: "Requires a wallet session. Supports server-side log, self-custody transaction verification, and a legacy tx-hash recording mode.",
        security: [{ walletSession: [] }],
        parameters: [uuidParam("id", "Audit report id.")],
        requestBody: { required: true, content: { "application/json": { schema: { oneOf: [{ type: "object", required: ["action"], properties: { action: { type: "string", const: "log" } } }, { type: "object", required: ["action", "txHash"], properties: { action: { type: "string", const: "record-self-custody" }, txHash: { type: "string", pattern: "^0x[a-fA-F0-9]{64}$" } } }, { type: "object", required: ["txHash"], properties: { txHash: { type: "string", pattern: "^0x[a-fA-F0-9]{64}$" }, metadataUri: { type: "string" } } }] }, examples: { selfCustody: { value: { action: "record-self-custody", txHash: liveExampleIds.proofTxHash } }, serverLog: { value: { action: "log" } } } } } },
        responses: {
          "200": { description: "Proof logged or verified", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/reports/{id}/proof/metadata": {
      get: {
        tags: ["Proofs"],
        summary: "Get proof metadata JSON",
        parameters: [uuidParam("id", "Audit report id.")],
        responses: {
          "200": { description: "Proof metadata", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
          "400": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/proofs": {
      get: {
        tags: ["Proofs"],
        summary: "List recent proofs",
        responses: { "200": { description: "Recent proofs", content: { "application/json": { schema: { type: "object", required: ["proofs"], properties: { proofs: { type: "array", items: { $ref: "#/components/schemas/Proof" } } } } } } } },
      },
    },
  },
  components: {
    securitySchemes: {
      walletSession: { type: "apiKey", in: "cookie", name: "archon_session", description: "Wallet session cookie created by SIWE auth routes. Public read endpoints do not require it." },
    },
    schemas: {
      ErrorResponse: { type: "object", required: ["error"], properties: { error: { type: "string" }, issues: { type: "array", items: { type: "object", additionalProperties: true } } }, additionalProperties: true },
      Health: { type: "object", required: ["ok", "db", "redis", "version"], properties: { ok: { type: "boolean" }, db: { type: "boolean" }, redis: { type: "boolean" }, version: { type: "string" } } },
      CreateScanRequest: { type: "object", required: ["sourceKind", "scanDepth", "protocols"], properties: { sourceKind: { type: "string", enum: ["paste", "address"] }, sourceCode: { type: "string" }, sourceRef: { type: "string" }, scanDepth: { type: "string", enum: ["quick", "deep", "gas-cost", "full-report"] }, protocols: { type: "array", minItems: 1, items: { type: "string", enum: ["mETH", "cmETH", "USDY", "Aave V3", "Merchant Moe", "Agni"] } } } },
      Scan: { type: "object", properties: { id: { type: "string", format: "uuid" }, sourceKind: { type: "string" }, sourceRef: { type: ["string", "null"] }, network: { type: "string" }, scanDepth: { type: "string" }, protocols: { type: "array", items: { type: "string" } }, status: { type: "string" }, progress: { type: "integer" }, currentStage: { type: ["string", "null"] }, createdAt: { type: "string", format: "date-time" }, startedAt: { type: ["string", "null"], format: "date-time" }, finishedAt: { type: ["string", "null"], format: "date-time" }, error: { type: ["string", "null"] } } },
      FindingSummary: { type: "object", properties: { id: { type: "string", format: "uuid" }, severity: { type: "string" }, category: { type: "string" }, title: { type: "string" }, file: { type: ["string", "null"] }, lineStart: { type: ["integer", "null"] }, lineEnd: { type: ["integer", "null"] }, summary: { type: ["string", "null"] }, status: { type: "string" } } },
      ScanSnapshot: { type: "object", required: ["scan", "findings", "logs", "report"], properties: { scan: { $ref: "#/components/schemas/Scan" }, findings: { type: "array", items: { $ref: "#/components/schemas/FindingSummary" } }, logs: { type: "array", items: { type: "object", additionalProperties: true } }, report: { anyOf: [{ type: "object", additionalProperties: true }, { type: "null" }] } } },
      ReportExport: { type: "object", required: ["schema", "report", "findings"], properties: { schema: { type: "string", const: "archon.report.export.v1" }, report: { type: "object", additionalProperties: true }, findings: { type: "array", items: { type: "object", additionalProperties: true } } } },
      CreateGasScanRequest: { type: "object", properties: { sourceKind: { type: "string", enum: ["paste", "sample", "address"], default: "paste" }, sourceCode: { type: "string" }, sourceRef: { type: "string" }, callsPerYear: { type: "integer", minimum: 1, maximum: 1000000000 }, mntUsd: { type: "number", exclusiveMinimum: 0, maximum: 1000 } } },
      GasScanQueued: { type: "object", required: ["gasReportId", "status", "sourceHash", "contractName", "assumptions"], properties: { gasReportId: { type: "string", format: "uuid" }, status: { type: "string", const: "queued" }, sourceHash: { type: "string" }, contractName: { type: "string" }, assumptions: { type: "object", additionalProperties: true } } },
      GasReport: { type: "object", properties: { id: { type: "string", format: "uuid" }, sourceKind: { type: "string" }, sourceRef: { type: ["string", "null"] }, sourceHash: { type: ["string", "null"] }, contractName: { type: ["string", "null"] }, network: { type: "string" }, status: { type: "string" }, progress: { type: "integer" }, currentStage: { type: ["string", "null"] }, pricing: { type: ["object", "null"], additionalProperties: true }, measurement: { type: ["object", "null"], additionalProperties: true }, totals: { type: ["object", "null"], additionalProperties: true }, assumptions: { type: ["object", "null"], additionalProperties: true }, reportHash: { type: ["string", "null"] }, anchorTxHash: { type: ["string", "null"] }, createdAt: { type: "string", format: "date-time" }, error: { type: ["string", "null"] } } },
      GasOptimization: { type: "object", properties: { id: { type: "string", format: "uuid" }, ruleId: { type: "string" }, title: { type: "string" }, category: { type: "string" }, location: { type: ["string", "null"] }, before: { type: ["string", "null"] }, after: { type: ["string", "null"] }, safety: { type: "string" }, confidence: { type: ["number", "string", "null"] }, status: { type: "string" }, measurementLabel: { type: ["string", "null"] }, estL2Delta: { type: ["integer", "null"] }, measuredL2Delta: { type: ["integer", "null"] }, estL1DeltaWei: { type: ["string", "number", "null"] }, measuredL1DeltaWei: { type: ["string", "number", "null"] }, annualSavingsUsd: { type: ["string", "number", "null"] }, patch: { type: ["object", "null"], additionalProperties: true }, gasDiff: { type: ["object", "null"], additionalProperties: true }, notes: { type: ["string", "null"] } } },
      GasReportResponse: { type: "object", required: ["schema", "report", "optimizations"], properties: { schema: { type: "string", const: "archon.gas.report.v1" }, report: { $ref: "#/components/schemas/GasReport" }, optimizations: { type: "array", items: { $ref: "#/components/schemas/GasOptimization" } } } },
      GasPatchQueued: { type: "object", required: ["status", "gasReportId", "optId", "message"], properties: { status: { type: "string", const: "queued" }, gasReportId: { type: "string", format: "uuid" }, optId: { type: "string", format: "uuid" }, message: { type: "string" } } },
      GasPatchReady: { type: "object", required: ["status", "patchedSource", "gasDiff"], properties: { status: { type: "string", const: "ready" }, patchedSource: { type: "string" }, gasDiff: { type: "object", additionalProperties: true } } },
      AnchorResult: { type: "object", properties: { gasReportId: { type: "string", format: "uuid" }, reportHash: { type: "string" }, txHash: { type: ["string", "null"] }, metadataUri: { type: "string" }, explorer: { type: "string" }, alreadyAnchored: { type: "boolean" } }, additionalProperties: true },
      GasLeaderboard: { type: "object", required: ["schema", "generatedAt", "filters", "assumption", "rows"], properties: { schema: { type: "string", const: "archon.gas.leaderboard.v2" }, generatedAt: { type: "string", format: "date-time" }, filters: { type: "object", additionalProperties: true }, assumption: { type: "string" }, rows: { type: "array", items: { type: "object", additionalProperties: true } } } },
      PreparedProof: { type: "object", properties: { proofId: { type: "string", format: "uuid" }, reportHash: { type: "string" }, metadataUri: { type: "string" }, metadata: { type: "object", additionalProperties: true }, network: { type: "string" }, chainId: { type: "integer" }, configured: { type: "boolean" }, blocker: { type: ["string", "null"] }, selfCustody: { anyOf: [{ type: "object", additionalProperties: true }, { type: "null" }] } }, additionalProperties: true },
      Proof: { type: "object", properties: { id: { type: "string", format: "uuid" }, reportId: { type: "string", format: "uuid" }, contractName: { type: "string" }, riskScore: { type: "integer" }, reportHash: { type: "string" }, txHash: { type: ["string", "null"] }, metadataUri: { type: ["string", "null"] }, network: { type: ["string", "null"] }, loggedAt: { type: ["string", "null"], format: "date-time" }, verificationStatus: { type: ["string", "null"] } } },
    },
  },
  xArchonExamples: {
    curl: {
      gasReport: `curl https://archonaudit.xyz/api/gas/reports/${liveExampleIds.gasReportId}`,
      leaderboard: "curl 'https://archonaudit.xyz/api/gas/leaderboard?metric=score&q=VaultV2'",
      proofMetadata: `curl https://archonaudit.xyz/api/reports/${liveExampleIds.auditReportId}/proof/metadata`,
    },
    typescript: `const res = await fetch('https://archonaudit.xyz/api/gas/reports/${liveExampleIds.gasReportId}');\nconst data = await res.json();\nconsole.log(data.report.contractName, data.report.totals);`,
  },
} as const;
