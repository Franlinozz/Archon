import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { fetchVerifiedSource, ExplorerError } from "@/lib/chain/explorer";
import { compileSoliditySource } from "@/lib/solidity/compiler";
import { enrichFindingsForScan } from "@/lib/ai/enrichment";
import { measureGasOptimizations } from "@/lib/gas/measurement";
import { analyzeGasOptimizations } from "@/lib/gas/optimizer";
import { generateTestsForScan } from "@/lib/tests/generation";
import { appendScanLog } from "./events";
import type { PipelineStage, ScanContext, ScanFinding, ScanRecord, Severity } from "./types";
import { dependencyRemapGroupsForSource, dependencyRemappingsForSource, importCandidates, parseFoundryRemappings, solcIncludePaths, solcRemapArgs, solidityImports, type SolidityRemapping } from "@/lib/source/solidity";
import { deriveContractName } from "@/lib/source/names";

const execFileAsync = promisify(execFile);
const TOOL_PATHS = [process.env.ARCHON_ANALYZER_PATH, "/opt/archon-slither/bin", "/root/.local/bin"].filter(Boolean).join(":");
const SLITHER_BIN = process.env.SLITHER_BIN ?? "slither";
const SOLC_BIN = process.env.SOLC_BIN ?? "solc";
const analyzerEnv = { ...process.env, PATH: `${TOOL_PATHS}:${process.env.PATH ?? ""}` };

export type StageDefinition = {
  name: PipelineStage;
  run: (ctx: ScanContext) => Promise<ScanContext>;
};

type SlitherDetector = {
  check?: string;
  impact?: string;
  confidence?: string;
  description?: string;
  first_markdown_element?: string;
  elements?: Array<{ source_mapping?: { filename_relative?: string; filename_absolute?: string; lines?: number[]; starting_column?: number; ending_column?: number } }>;
};

function normalizeSeverity(impact?: string): Severity {
  const value = impact?.toLowerCase() ?? "";
  if (value.includes("critical")) return "critical";
  if (value.includes("high")) return "high";
  if (value.includes("medium")) return "medium";
  if (value.includes("low") || value.includes("optimization")) return "low";
  return "info";
}

function titleFromDetector(detector: SlitherDetector) {
  const check = detector.check ?? "slither-finding";
  return check.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function extractLocation(detector: SlitherDetector) {
  const mapping = detector.elements?.find((element) => element.source_mapping?.lines?.length)?.source_mapping;
  const markdown = detector.first_markdown_element ?? "";
  const markdownMatch = markdown.match(/([^/#]+\.sol)#L(\d+)(?:-L(\d+))?/);
  if (mapping?.lines?.length) {
    return {
      file: path.basename(mapping.filename_relative ?? mapping.filename_absolute ?? "Contract.sol"),
      lineStart: Math.min(...mapping.lines),
      lineEnd: Math.max(...mapping.lines),
    };
  }
  if (markdownMatch) {
    return { file: path.basename(markdownMatch[1]!), lineStart: Number(markdownMatch[2]), lineEnd: Number(markdownMatch[3] ?? markdownMatch[2]) };
  }
  return { file: "Contract.sol", lineStart: null, lineEnd: null };
}

function codeSnippet(source: string, lineStart: number | null, lineEnd: number | null) {
  if (!lineStart) return null;
  const lines = source.split("\n");
  const start = Math.max(1, lineStart - 2);
  const end = Math.min(lines.length, (lineEnd ?? lineStart) + 2);
  return lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join("\n");
}

function buildDedupeKey(finding: Omit<ScanFinding, "dedupeKey"> & { dedupeKey?: string }) {
  return finding.dedupeKey ?? createHash("sha256").update(`${finding.source}:${finding.category}:${finding.title}:${finding.file}:${finding.lineStart}:${finding.lineEnd}`).digest("hex");
}

function addFinding(ctx: ScanContext, finding: Omit<ScanFinding, "dedupeKey"> & { dedupeKey?: string }) {
  const key = buildDedupeKey(finding);
  if (ctx.findings.some((existing) => existing.dedupeKey === key)) return ctx;
  ctx.findings.push({ ...finding, dedupeKey: key });
  return ctx;
}

export function collectProtocolRuleFindings(source: string, sourceFile = "Contract.sol") {
  const findings: ScanFinding[] = [];
  const add = (finding: Omit<ScanFinding, "dedupeKey"> & { dedupeKey?: string }) => findings.push({ ...finding, dedupeKey: buildDedupeKey(finding) });
  const basename = path.basename(sourceFile);
  const firstLine = (needle: string | RegExp) => {
    const lines = source.split("\n");
    const index = typeof needle === "string" ? lines.findIndex((line) => line.includes(needle)) : lines.findIndex((line) => needle.test(line));
    return index >= 0 ? index + 1 : null;
  };

  if (/\.call\s*\{\s*value:/m.test(source) && /balances\[msg\.sender\]\s*-=/m.test(source)) {
    const line = firstLine(".call{value");
    add({
      severity: "critical",
      category: "mantle-reentrancy-rule",
      title: "External value transfer before balance update",
      file: basename,
      lineStart: line,
      lineEnd: null,
      codeSnippet: codeSnippet(source, line, null),
      summary: "A value-transferring external call occurs before local accounting is finalized, creating a reentrancy window.",
      whyMantle: "Mantle contracts still inherit EVM reentrancy risk; bridge and yield flows can amplify impact when vault balances represent liquid positions.",
      exploitScenario: "An attacker contract re-enters withdraw() before its balance is reduced and drains repeated payouts.",
      recommendedFix: "Apply checks-effects-interactions: decrement the balance before the call, or use a reentrancy guard and pull-payment pattern.",
      confidence: 0.95,
      source: "rule",
    });
  }

  if (/minAmountOut/.test(source) && !/require\s*\(\s*amountOut\s*>=\s*minAmountOut/.test(source)) {
    const line = firstLine("minAmountOut");
    add({
      severity: "high",
      category: "mantle-missing-slippage-bound",
      title: "Missing slippage enforcement for swap output",
      file: basename,
      lineStart: line,
      lineEnd: null,
      codeSnippet: codeSnippet(source, line, null),
      summary: "The function accepts a minimum output parameter but does not enforce it against the received amount.",
      whyMantle: "Mantle DeFi routes through DEX/liquid-staking liquidity where price movement and MEV can make unchecked output assumptions dangerous.",
      exploitScenario: "A user submits a swap expecting bounded output, but receives materially less because minAmountOut is ignored.",
      recommendedFix: "Require amountOut >= minAmountOut immediately after the swap result is known.",
      confidence: 0.92,
      source: "rule",
    });
  }

  if (/\.length/.test(source) && /for\s*\(/.test(source) && /storage array|depositors\.length|recipients\.length/.test(source)) {
    const line = firstLine(".length");
    add({
      severity: "medium",
      category: "mantle-l1-data-fee-unaware-gas",
      title: "Unbounded storage iteration can create runaway gas cost",
      file: basename,
      lineStart: line,
      lineEnd: null,
      codeSnippet: codeSnippet(source, line, null),
      summary: "The contract loops over a storage array without a cap. This can become too expensive as the set grows.",
      whyMantle: "Mantle execution is cheaper than L1, but unbounded loops still threaten UX and can become denial-of-service vectors under variable data fees.",
      recommendedFix: "Track aggregates incrementally or process recipients in bounded batches with cursor state.",
      confidence: 0.86,
      gasImpact: "Potentially unbounded gas growth with each new depositor/recipient.",
      source: "rule",
    });
  }

  if (/latestAnswer\s*\(/.test(source) && !/block\.timestamp\s*-\s*[^;]+latestTimestamp|stale|heartbeat/i.test(source)) {
    const line = firstLine("latestAnswer");
    add({
      severity: "medium",
      category: "mantle-oracle-heartbeat",
      title: "Oracle price read lacks freshness heartbeat check",
      file: basename,
      lineStart: line,
      lineEnd: null,
      codeSnippet: codeSnippet(source, line, null),
      summary: "Oracle output is consumed without enforcing a maximum staleness window.",
      whyMantle: "Protocol integrations should encode feed heartbeat assumptions explicitly so stale L2 reads do not drive collateral or swap decisions.",
      recommendedFix: "Read the feed timestamp and require block.timestamp - updatedAt <= configuredHeartbeat.",
      confidence: 0.82,
      source: "rule",
    });
  }

  if (/tx\.origin/.test(source)) {
    const line = firstLine("tx.origin");
    add({
      severity: "high",
      category: "mantle-origin-auth",
      title: "tx.origin authorization can be phished through proxy calls",
      file: basename,
      lineStart: line,
      lineEnd: null,
      codeSnippet: codeSnippet(source, line, null),
      summary: "Authorization relies on tx.origin instead of msg.sender, allowing malicious intermediary contracts to relay privileged calls from a real owner.",
      whyMantle: "Mantle users interact through wallets, account abstractions, and app routers; origin-based auth breaks composability and increases phishing blast radius.",
      exploitScenario: "The owner signs a call to an attacker-controlled contract, which then invokes the protected function while tx.origin still equals the owner.",
      recommendedFix: "Use msg.sender with Ownable/AccessControl, or EIP-712 signatures scoped to an explicit action and nonce.",
      confidence: 0.94,
      source: "rule",
    });
  }

  if (/block\.timestamp/.test(source) && /(deadline|settle|auction|expiry|unlock)/i.test(source) && !/(grace|buffer|maxDelay|minDelay)/i.test(source)) {
    const line = firstLine("block.timestamp");
    add({
      severity: "medium",
      category: "mantle-timestamp-assumption",
      title: "Timestamp-sensitive settlement lacks explicit tolerance window",
      file: basename,
      lineStart: line,
      lineEnd: null,
      codeSnippet: codeSnippet(source, line, null),
      summary: "Business logic depends on block.timestamp for settlement/deadline behavior without documenting or enforcing a tolerance window.",
      whyMantle: "L2 timestamp and sequencing assumptions should be explicit for liquidations, auctions, and settlement flows so integrations know the accepted drift/grace policy.",
      recommendedFix: "Add explicit min/max delay bounds, grace periods, and tests that cover boundary timestamps on a Mantle fork.",
      confidence: 0.78,
      source: "rule",
    });
  }

  return findings;
}

function displayContractName(scan: ScanRecord, source: string, compiledNames?: string[]) {
  const label = scan.source_kind === "paste" ? scan.source_ref?.trim() : null;
  return deriveContractName(source, { label, compiledNames });
}

function detectPragma(source: string) {
  return source.match(/pragma\s+solidity\s+([^;]+);/)?.[1]?.trim() ?? "^0.8.24";
}

function chooseSolcVersion(pragma: string) {
  const exact = pragma.match(/(0\.8\.(?:20|24|26|30))/)?.[1];
  return exact ?? "0.8.24";
}

async function ensureSource(scan: ScanRecord): Promise<{ source: string; bundle: ScanRecord["source_bundle"] }> {
  // Only an explicit address scan goes to the explorer; paste (and any upload/github
  // bundle, which the API stores as paste) reads the stored source directly.
  if (scan.source_kind !== "address") return { source: scan.source_code?.trim() ?? "", bundle: null };
  const address = scan.source_ref?.trim();
  if (!address) throw new Error("Contract address scan is missing source_ref");
  try {
    const { source, files } = await fetchVerifiedSource(address);
    // Multi-file verified contracts need their dependency siblings written too.
    return { source, bundle: files.length > 1 ? files : null };
  } catch (err) {
    if (err instanceof ExplorerError) {
      if (err.kind === "not-verified") throw new Error("No verified Solidity source for this address on Mantle. Paste the contract source instead.");
      if (err.kind === "no-key" || err.kind === "bad-input") throw new Error(err.message);
      throw new Error(`Couldn't reach the Mantle explorer (${err.kind}). Paste the contract source instead.`);
    }
    throw err;
  }
}

function safeBundlePath(rawPath: string) {
  const normalized = rawPath.replaceAll("\\", "/").split("/").filter(Boolean).join("/");
  const allowedConfig = normalized === "remappings.txt" || normalized === "foundry.toml";
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized === ".." || (!normalized.endsWith(".sol") && !allowedConfig)) throw new Error(`Unsafe Solidity bundle path: ${rawPath}`);
  return normalized;
}

function isImportResolutionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Source .* not found|File not found|not found in workspace|Invalid solc compilation/i.test(message);
}

function shortToolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n").find((line) => /not found|failed|Error:/i.test(line))?.trim().slice(0, 260) ?? message.slice(0, 260);
}

function missingImportsFromError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return [...new Set([
    ...Array.from(message.matchAll(/Source\s+"?([^"\n]+\.sol)"?\s+not found/gi)).map((match) => match[1]!),
    ...Array.from(message.matchAll(/Source\s+([^\s]+\.sol)\s+not found/gi)).map((match) => match[1]!),
    ...Array.from(message.matchAll(/import\s+\{?[^"']*\}?\s+from\s+"([^"]+\.sol)"/gi)).map((match) => match[1]!),
  ])].slice(0, 20);
}

function buildSolcArgs(workdir: string) {
  return ["--base-path", workdir, "--allow-paths", workdir].join(" ");
}

function slitherAttempts(ctx: ScanContext) {
  const groups = dependencyRemapGroupsForSource(ctx.sourceCode, ctx.metadata.unresolvedImports as string[] | undefined);
  const sourceTarget = path.relative(ctx.workdir, ctx.sourceFile).replaceAll("\\", "/");
  const seen = new Set<string>();
  return groups.map((remappings) => ({
    remappings,
    args: [
      sourceTarget,
      "--solc",
      SOLC_BIN,
      "--solc-args",
      buildSolcArgs(ctx.workdir),
      "--solc-remaps",
      solcRemapArgs(remappings).join(" "),
    ],
  })).filter((attempt) => {
    const key = attempt.args.join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 2);
}

async function workspaceRemappings(workdir: string, sourceCode = "") {
  const texts = await Promise.all([
    readFile(path.join(workdir, "remappings.txt"), "utf8").catch(() => ""),
    readFile(path.join(workdir, "foundry.toml"), "utf8").catch(() => ""),
  ]);
  return [...texts.flatMap(parseFoundryRemappings), ...dependencyRemappingsForSource(sourceCode)];
}

async function copyLocalDependencyImport(workdir: string, importPath: string) {
  if (importPath.startsWith("./") || importPath.startsWith("../")) return false;
  const source = [path.join(process.cwd(), "node_modules", importPath), path.join(process.cwd(), "lib/source/vendor", importPath)].find((candidate) => existsSync(candidate));
  if (!source) return false;
  const target = path.join(workdir, importPath);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return true;
}

async function copyLocalCandidate(workdir: string, candidatePath: string) {
  const source = [
    candidatePath,
    ...solcIncludePaths(workdir).map((base) => path.join(base, candidatePath)),
    path.join(process.cwd(), candidatePath),
    path.join(process.cwd(), "node_modules", candidatePath),
    path.join(process.cwd(), "lib/source/vendor", candidatePath.replace(/^node_modules\//, "")),
  ].find((candidate) => existsSync(candidate));
  if (!source) return false;
  const target = path.join(workdir, candidatePath);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return true;
}

async function hydrateWorkspaceImports(workdir: string, sourceCode: string, entryFile: string) {
  const remappings = await workspaceRemappings(workdir, sourceCode);
  const seen = new Set<string>();
  const unresolved = new Set<string>();
  // Seed ONLY from the selected contract and walk its transitive import closure.
  // (Previously this seeded from every .sol in the workspace, so unrelated files
  // bundled alongside the target — e.g. a whole GitHub repo's siblings or foundry
  // out/ artifacts — could pull a clean contract into reduced mode when one of
  // THEIR imports didn't resolve.)
  const queue = [entryFile];

  while (queue.length && seen.size < 240) {
    const file = queue.shift()!;
    const rel = path.relative(workdir, file).replaceAll("\\", "/");
    if (seen.has(rel)) continue;
    seen.add(rel);
    const source = await readFile(file, "utf8").catch(() => "");
    for (const specifier of solidityImports(source)) {
      const candidates = importCandidates(specifier, rel, remappings);
      const found = candidates.find((candidate) => existsSync(path.join(workdir, candidate)));
      if (found) continue;
      const copiedCandidate = await (async () => {
        for (const candidate of candidates) {
          if (await copyLocalCandidate(workdir, candidate)) return candidate;
        }
        return null;
      })();
      if (copiedCandidate) {
        queue.push(path.join(workdir, copiedCandidate));
        continue;
      }
      if (await copyLocalDependencyImport(workdir, specifier)) {
        queue.push(path.join(workdir, specifier));
        continue;
      }
      unresolved.add(specifier);
    }
  }
  return [...unresolved];
}

async function writeSourceWorkspace(workdir: string, sourceCode: string, bundle: ScanRecord["source_bundle"], fallbackName: string) {
  if (bundle?.length) {
    let selected: string | null = null;
    for (const file of bundle) {
      const safePath = safeBundlePath(file.path);
      const target = path.join(workdir, safePath);
      await import("node:fs/promises").then(({ mkdir }) => mkdir(path.dirname(target), { recursive: true }));
      await writeFile(target, file.source);
      if (!selected && file.source.trim() === sourceCode.trim()) selected = target;
    }
    if (selected) return selected;
  }
  const sourceFile = path.join(workdir, `${fallbackName}.sol`);
  await writeFile(sourceFile, sourceCode);
  return sourceFile;
}

export async function createInitialContext(scan: ScanRecord): Promise<ScanContext> {
  const { source: sourceCode, bundle } = await ensureSource(scan);
  const workdir = await mkdtemp(path.join(tmpdir(), `archon-scan-${scan.id}-`));
  // An address scan's verified bundle (multi-file) takes precedence; otherwise the
  // stored upload/github bundle.
  const sourceFile = await writeSourceWorkspace(workdir, sourceCode, bundle ?? scan.source_bundle, displayContractName(scan, sourceCode));
  const unresolvedImports = await hydrateWorkspaceImports(workdir, sourceCode, sourceFile);
  const pragma = detectPragma(sourceCode);
  return {
    scan,
    sourceCode,
    sourceFile,
    workdir,
    pragma,
    solcVersion: chooseSolcVersion(pragma),
    contractName: displayContractName(scan, sourceCode),
    findings: [],
    insertedFindingIds: new Set<string>(),
    logs: [],
    metadata: unresolvedImports.length ? { unresolvedImports } : {},
    reducedMode: unresolvedImports.length ? { reason: "External imports could not be resolved.", unresolvedImports } : undefined,
  };
}

export async function cleanupContext(ctx: ScanContext) {
  await rm(ctx.workdir, { recursive: true, force: true });
}

async function codeParse(ctx: ScanContext) {
  try {
    const result = await compileSoliditySource({ workdir: ctx.workdir, sourceFile: ctx.sourceFile, pragma: ctx.pragma });
    ctx.contractName = displayContractName(ctx.scan, ctx.sourceCode, result.contractNames);
    ctx.metadata.compile = { ok: true, pragma: ctx.pragma, solcVersion: result.compilerVersion, contractName: ctx.contractName, warnings: result.warnings };
  } catch (error) {
    if (!isImportResolutionError(error)) throw error;
    const unresolvedImports = [...new Set([...(ctx.reducedMode?.unresolvedImports ?? []), ...missingImportsFromError(error)])];
    ctx.reducedMode = { reason: "External imports could not be resolved.", unresolvedImports, detail: shortToolError(error) };
    ctx.metadata.compile = { ok: false, pragma: ctx.pragma, solcVersion: ctx.solcVersion, reducedMode: true, unresolvedImports, detail: shortToolError(error) };
    await appendScanLog(ctx.scan.id, "WARN", `External imports could not be resolved (${unresolvedImports.join(", ") || "unknown import"}); static analysis will run in reduced mode.`);
  }
  return ctx;
}

async function staticAnalysis(ctx: ScanContext) {
  if (ctx.reducedMode) {
    ctx.metadata.slither = { skipped: true, reducedMode: true, unresolvedImports: ctx.reducedMode.unresolvedImports, detail: ctx.reducedMode.detail ?? null };
    await appendScanLog(ctx.scan.id, "WARN", "Slither skipped because external imports could not be resolved. Archon deterministic rules will still run.");
    return ctx;
  }
  const outFile = path.join(ctx.workdir, "slither.json");
  const attempts = slitherAttempts(ctx);
  let lastError: unknown = null;
  try {
    for (let index = 0; index < attempts.length; index++) {
      const attempt = attempts[index]!;
      try {
        await execFileAsync(SLITHER_BIN, [...attempt.args, "--json", outFile], { timeout: 90_000, env: analyzerEnv, cwd: ctx.workdir, maxBuffer: 10 * 1024 * 1024 });
        ctx.metadata.slitherAttempt = { ok: true, index: index + 1, remappings: solcRemapArgs(attempt.remappings) };
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const maybe = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
        await readFile(outFile, "utf8").then(() => { lastError = null; }).catch(() => undefined);
        if (!lastError) break;
        await appendScanLog(ctx.scan.id, "WARN", `Slither import attempt ${index + 1}/${attempts.length} failed: ${shortToolError(`${maybe.message}\n${maybe.stderr ?? ""}`)}`);
      }
    }
    if (lastError) throw lastError;
  } catch (error) {
    const maybe = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    // Slither exits non-zero when it finds issues. The JSON output is the source of truth.
    try {
      await readFile(outFile, "utf8");
    } catch {
      if (isImportResolutionError(`${maybe.message}\n${maybe.stderr ?? ""}`)) {
        const unresolvedImports = missingImportsFromError(`${maybe.message}\n${maybe.stderr ?? ""}`);
        ctx.reducedMode = { reason: "External imports could not be resolved.", unresolvedImports, detail: shortToolError(`${maybe.message}\n${maybe.stderr ?? ""}`) };
        ctx.metadata.slither = { skipped: true, reducedMode: true, unresolvedImports, detail: ctx.reducedMode.detail };
        await appendScanLog(ctx.scan.id, "WARN", `Slither skipped because external imports could not be resolved (${unresolvedImports.join(", ") || "unknown import"}).`);
        return ctx;
      }
      throw new Error(`Slither failed before producing JSON: ${shortToolError(maybe)}`);
    }
  }

  const parsed = JSON.parse(await readFile(outFile, "utf8")) as { results?: { detectors?: SlitherDetector[] } };
  const detectors = parsed.results?.detectors ?? [];
  for (const detector of detectors) {
    const location = extractLocation(detector);
    const severity = normalizeSeverity(detector.impact);
    addFinding(ctx, {
      severity,
      category: detector.check ?? "slither",
      title: titleFromDetector(detector),
      file: location.file,
      lineStart: location.lineStart,
      lineEnd: location.lineEnd,
      codeSnippet: codeSnippet(ctx.sourceCode, location.lineStart, location.lineEnd),
      summary: (detector.description ?? titleFromDetector(detector)).trim().slice(0, 1800),
      recommendedFix: severity === "high" ? "Move state updates before external calls and add reentrancy protection where appropriate." : null,
      confidence: detector.confidence?.toLowerCase() === "high" ? 0.9 : 0.75,
      gasImpact: detector.impact === "Optimization" ? "Potential gas reduction from Slither optimization detector." : null,
      source: "slither",
      dedupeKey: `slither:${detector.check}:${location.file}:${location.lineStart}:${location.lineEnd}`,
    });
  }
  ctx.metadata.slither = { detectorCount: detectors.length };
  return ctx;
}

async function mantleContextFetch(ctx: ScanContext) {
  ctx.metadata.mantleContext = ctx.scan.source_kind === "paste"
    ? { mode: "paste", note: "n/a — pasted source", readOnly: true }
    : { mode: "address", address: ctx.scan.source_ref, readOnly: true, note: "verified-source fetch queued for address-mode hardening" };
  return ctx;
}

async function protocolRuleEngine(ctx: ScanContext) {
  for (const finding of collectProtocolRuleFindings(ctx.sourceCode, ctx.sourceFile)) addFinding(ctx, finding);

  ctx.metadata.rules = { findingCount: ctx.findings.filter((finding) => finding.source === "rule").length };
  return ctx;
}

async function gasOptimization(ctx: ScanContext) {
  const analysis = await analyzeGasOptimizations({
    source: ctx.sourceCode,
    sourceFile: ctx.sourceFile,
    workdir: ctx.workdir,
    contractName: ctx.contractName,
  });
  for (const finding of analysis.findings) addFinding(ctx, finding);
  const measurement = ctx.reducedMode ? {
    version: "archon.gasMeasurement.v1",
    rulesetHash: "reduced-mode",
    contractHash: createHash("sha256").update(ctx.sourceCode).digest("hex"),
    status: "skipped",
    measuredAt: new Date().toISOString(),
    source: "deterministic-estimate",
    patches: [],
    forge: { attempted: false, ok: false, command: null, gasReport: null, error: "Reduced mode: external imports unresolved." },
  } : await measureGasOptimizations({
      source: ctx.sourceCode,
      sourceFile: ctx.sourceFile,
      contractName: ctx.contractName,
      opportunities: analysis.profile.opportunities,
      onProgress: (message) => appendScanLog(ctx.scan.id, "INFO", message),
    });
  ctx.metadata.gasOptimizer = { ...analysis.profile, measurement };
  return ctx;
}

async function aiReasoning(ctx: ScanContext) {
  ctx.metadata.aiReasoning = await enrichFindingsForScan(ctx.scan.id);
  return ctx;
}

async function testGeneration(ctx: ScanContext) {
  ctx.metadata.generatedTests = await generateTestsForScan(ctx.scan.id, ctx.contractName);
  return ctx;
}

async function passThrough(ctx: ScanContext) {
  return ctx;
}

function severityCounts(findings: ScanFinding[]) {
  return findings.reduce<Record<Severity, number>>((acc, finding) => {
    acc[finding.severity] += 1;
    return acc;
  }, { critical: 0, high: 0, medium: 0, low: 0, info: 0 });
}

function riskScore(counts: Record<Severity, number>) {
  const weighted = counts.critical * 28 + counts.high * 18 + counts.medium * 10 + counts.low * 4 + counts.info * 1;
  return Math.max(1, Math.min(100, 12 + weighted));
}

async function reportAssembly(ctx: ScanContext) {
  const counts = severityCounts(ctx.findings);
  const risk = riskScore(counts);
  const enriched = await db.query<{ title: string; severity: string; summary: string | null; recommended_fix: string | null }>(
    "select title, severity, summary, recommended_fix from findings where scan_id = $1 order by sort_index nulls last, id limit 5",
    [ctx.scan.id],
  );
  const top = enriched.rows.find((row) => row.severity === "critical" || row.severity === "high") ?? enriched.rows[0];
  const reducedNote = ctx.reducedMode ? ` External imports could not be resolved (${ctx.reducedMode.unresolvedImports.join(", ") || "unknown import"}); static analysis ran in reduced mode, so Slither/import-dependent checks were skipped while Archon's deterministic rules still ran.` : "";
  const executiveSummary = top
    ? `Archon completed a read-only Mantle Mainnet audit of ${ctx.contractName} and found ${ctx.findings.length} deterministic finding${ctx.findings.length === 1 ? "" : "s"}. The highest-priority issue is ${top.title}, with risk score ${risk}/100 based on severity-weighted findings. ${top.summary ?? "Each finding includes line-level traceability and recommended engineering remediation."} Review the recommended fixes and run regression tests before deployment.`
    : `Archon completed a read-only Mantle Mainnet audit of ${ctx.contractName}. No deterministic findings were persisted for this scan, but this report should still be reviewed before relying on the result.`;
  const result = await db.query<{ id: string }>(
    `insert into reports (scan_id, contract_name, risk_score, severity_counts, scope, tests, executive_summary, report_hash, created_at)
     values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, now()) returning id`,
    [
      ctx.scan.id,
      ctx.contractName,
      risk,
      JSON.stringify(counts),
      JSON.stringify({ sourceKind: ctx.scan.source_kind, network: ctx.scan.network, pragma: ctx.pragma, solcVersion: ctx.solcVersion, protocols: ctx.scan.protocols ?? [], lineCount: ctx.sourceCode.split("\n").length, gasOptimizer: ctx.metadata.gasOptimizer ?? null, reducedMode: ctx.reducedMode ?? null, aiReasoning: ctx.metadata.aiReasoning ?? null }),
      JSON.stringify(ctx.metadata.generatedTests ?? null),
      `${executiveSummary}${reducedNote}`,
      createHash("sha256").update(`${ctx.scan.id}:${ctx.contractName}:${JSON.stringify(counts)}:${ctx.findings.length}`).digest("hex"),
    ],
  );
  ctx.reportId = result.rows[0]!.id;
  await db.query("update findings set report_id = $1 where scan_id = $2 and report_id is null", [ctx.reportId, ctx.scan.id]);
  ctx.metadata.report = { id: ctx.reportId, riskScore: risk, severityCounts: counts };
  return ctx;
}

export const STAGES: StageDefinition[] = [
  { name: "Code Parse", run: codeParse },
  { name: "Static Analysis", run: staticAnalysis },
  { name: "Mantle Context Fetch", run: mantleContextFetch },
  { name: "Protocol Rule Engine", run: protocolRuleEngine },
  { name: "Gas Optimization", run: gasOptimization },
  { name: "AI Reasoning", run: aiReasoning },
  { name: "Test Generation", run: testGeneration },
  { name: "Report Assembly", run: reportAssembly },
];

export function getSeverityCounts(findings: ScanFinding[]) {
  return severityCounts(findings);
}

export function getRiskScore(findings: ScanFinding[]) {
  return riskScore(severityCounts(findings));
}
