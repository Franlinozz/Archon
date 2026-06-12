import { z } from "zod";

// Policy-as-code (F3): archon.config.json at the repository root. The GitHub
// App reads this schema; the GitHub Action documents the same keys so one file
// governs both.
export const archonConfigSchema = z.object({
  /** Fail the check when any finding is at/above this severity. */
  failOn: z.enum(["critical", "high", "medium"]).optional(),
  /** Allowed L2 gas regression per call before the gas gate fails. */
  maxRegressionL2Gas: z.number().int().min(0).optional(),
  /** Path prefixes to include (default: all .sol files in the diff). */
  paths: z.array(z.string().min(1).max(200)).max(50).optional(),
  /** Run the gas engine on PRs (default true). */
  gas: z.boolean().optional(),
  /** Rule id allow/deny lists applied to comment + autofix offers. */
  rules: z.object({ allow: z.array(z.string()).max(200).optional(), deny: z.array(z.string()).max(200).optional() }).optional(),
}).strict();

export type ArchonConfig = z.infer<typeof archonConfigSchema>;

export function parseArchonConfig(raw: string | null): { config: ArchonConfig; error: string | null } {
  if (!raw) return { config: {}, error: null };
  try {
    const parsed = archonConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { config: {}, error: `archon.config.json invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
    return { config: parsed.data, error: null };
  } catch {
    return { config: {}, error: "archon.config.json is not valid JSON." };
  }
}

const SEV_ORDER = ["critical", "high", "medium", "low", "info"];
export function breachesFailOn(findings: Array<{ severity: string }>, failOn: ArchonConfig["failOn"]) {
  if (!failOn) return [];
  const threshold = SEV_ORDER.indexOf(failOn);
  return findings.filter((f) => SEV_ORDER.indexOf(f.severity) <= threshold);
}

export function pathAllowed(filePath: string, config: ArchonConfig) {
  if (!config.paths?.length) return true;
  return config.paths.some((prefix) => filePath === prefix || filePath.startsWith(prefix.replace(/\/$/, "") + "/"));
}

export function ruleAllowed(ruleId: string | null | undefined, config: ArchonConfig) {
  if (!ruleId) return true;
  if (config.rules?.deny?.includes(ruleId)) return false;
  if (config.rules?.allow?.length) return config.rules.allow.includes(ruleId);
  return true;
}
