export const PIPELINE_STAGES = [
  "Code Parse",
  "Static Analysis",
  "Mantle Context Fetch",
  "Protocol Rule Engine",
  "Gas Optimization",
  "AI Reasoning",
  "Test Generation",
  "Report Assembly",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type ScanSourceKind = "paste" | "address";

export type ScanRecord = {
  id: string;
  source_kind: ScanSourceKind;
  source_ref: string | null;
  source_code: string | null;
  source_bundle: Array<{ path: string; source: string }> | null;
  network: string | null;
  scan_depth: string | null;
  protocols: string[] | null;
  status: string | null;
};

export type ScanFinding = {
  id?: string;
  severity: Severity;
  category: string;
  title: string;
  file: string;
  lineStart: number | null;
  lineEnd: number | null;
  codeSnippet: string | null;
  summary: string;
  whyMantle?: string | null;
  exploitScenario?: string | null;
  recommendedFix?: string | null;
  confidence?: number | null;
  gasImpact?: string | null;
  source: "slither" | "rule";
  dedupeKey: string;
};

export type ScanContext = {
  scan: ScanRecord;
  sourceCode: string;
  sourceFile: string;
  workdir: string;
  pragma: string;
  solcVersion: string;
  contractName: string;
  findings: ScanFinding[];
  insertedFindingIds: Set<string>;
  reportId?: string;
  logs: string[];
  metadata: Record<string, unknown>;
};

export type ScanEvent =
  | { type: "stage"; scanId: string; stage: PipelineStage | "Done"; progress: number; status: string; at: string }
  | { type: "finding"; scanId: string; finding: Record<string, unknown>; at: string }
  | { type: "log"; scanId: string; level: "INFO" | "WARN" | "ERROR"; message: string; at: string }
  | { type: "done"; scanId: string; reportId: string; progress: number; status: "done"; at: string }
  | { type: "failed"; scanId: string; error: string; status: "failed"; at: string };
