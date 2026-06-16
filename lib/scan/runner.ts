import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { appendScanLog, publishScanEvent } from "./events";
import { cleanupContext, createInitialContext, STAGES } from "./stages";
import { PIPELINE_STAGES, type ScanContext, type ScanFinding, type ScanRecord } from "./types";

// 20-min default watchdog so AI Reasoning can fully enrich large contracts (its own
// ~17-min budget sits under this); still a hard ceiling against a genuinely hung
// stage. Other stages have their own tighter internal timeouts (Slither 90s, etc.).
const configuredStageTimeoutMs = Number(process.env.ARCHON_STAGE_TIMEOUT_MS ?? 1_200_000);
const STAGE_TIMEOUT_MS = Math.max(Number.isFinite(configuredStageTimeoutMs) ? configuredStageTimeoutMs : 1_200_000, 600_000);

function progressForStage(index: number) {
  return Math.round(((index + 1) / PIPELINE_STAGES.length) * 100);
}

async function withTimeout<T>(label: string, fn: () => Promise<T>) {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} exceeded ${STAGE_TIMEOUT_MS / 1000}s watchdog timeout`)), STAGE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function loadScan(scanId: string) {
  const result = await db.query<ScanRecord>("select * from scans where id = $1", [scanId]);
  const scan = result.rows[0];
  if (!scan) throw new Error(`scan ${scanId} not found`);
  return scan;
}

function dbFindingParams(scanId: string, finding: ScanFinding, sortIndex: number) {
  return [
    scanId,
    finding.severity,
    finding.category,
    finding.title,
    finding.file,
    finding.lineStart,
    finding.lineEnd,
    finding.codeSnippet,
    finding.summary,
    finding.whyMantle ?? null,
    finding.exploitScenario ?? null,
    finding.recommendedFix ?? null,
    finding.confidence ?? null,
    finding.gasImpact ?? null,
    "open",
    sortIndex,
    finding.dedupeKey,
  ];
}

async function persistNewFindings(ctx: ScanContext) {
  const inserted: Record<string, unknown>[] = [];
  for (let index = 0; index < ctx.findings.length; index++) {
    const finding = ctx.findings[index]!;
    const stableKey = finding.dedupeKey || createHash("sha256").update(`${finding.title}:${finding.file}:${finding.lineStart}`).digest("hex");
    if (ctx.insertedFindingIds.has(stableKey)) continue;
    const result = await db.query<{ id: string; severity: string; category: string; title: string; file: string; line_start: number | null; line_end: number | null; summary: string; status: string }>(
      `insert into findings (scan_id, severity, category, title, file, line_start, line_end, code_snippet, summary, why_mantle, exploit_scenario, recommended_fix, confidence, gas_impact, status, sort_index, dedupe_key)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       on conflict (scan_id, dedupe_key) do nothing
       returning id, severity, category, title, file, line_start, line_end, summary, status`,
      dbFindingParams(ctx.scan.id, { ...finding, dedupeKey: stableKey }, index),
    );
    ctx.insertedFindingIds.add(stableKey);
    const row = result.rows[0];
    if (row) {
      inserted.push({
        id: row.id,
        severity: row.severity,
        category: row.category,
        title: row.title,
        file: row.file,
        lineStart: row.line_start,
        lineEnd: row.line_end,
        summary: row.summary,
        status: row.status,
      });
    }
  }
  return inserted;
}

async function markStage(scanId: string, stage: string, progress: number, status = "running") {
  await db.query("update scans set status = $1, current_stage = $2, progress = $3, started_at = coalesce(started_at, now()) where id = $4", [status, stage, progress, scanId]);
  await publishScanEvent({ type: "stage", scanId, stage: stage as never, progress, status, at: new Date().toISOString() });
}

function publicScanError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/Traceback|crytic_compile|Invalid solc compilation|Source .* not found|File not found/i.test(message)) {
    return "Static analyzer could not fully resolve external imports. Review scan logs for details; Archon avoids showing raw tool tracebacks in the UI.";
  }
  return message.split("\n")[0]?.slice(0, 500) || "Scan failed.";
}

export async function runScan(scanId: string) {
  await db.query("delete from scan_logs where scan_id = $1", [scanId]);
  await db.query("delete from findings where scan_id = $1 and report_id is null", [scanId]);
  await markStage(scanId, "Code Parse", 1, "running");
  await appendScanLog(scanId, "INFO", `Loaded scan ${scanId} from queue`);

  const scan = await loadScan(scanId);
  let ctx = await createInitialContext(scan);
  try {
    for (let index = 0; index < STAGES.length; index++) {
      const stage = STAGES[index]!;
      await markStage(scanId, stage.name, Math.max(1, Math.round((index / PIPELINE_STAGES.length) * 100)), "running");
      await appendScanLog(scanId, "INFO", `Starting stage ${index + 1}/${STAGES.length}: ${stage.name}`);
      ctx = await withTimeout(stage.name, () => stage.run(ctx));
      const newFindings = await persistNewFindings(ctx);
      for (const finding of newFindings) {
        await publishScanEvent({ type: "finding", scanId, finding, at: new Date().toISOString() });
      }
      const progress = progressForStage(index);
      await markStage(scanId, stage.name, progress, "running");
      await appendScanLog(scanId, "INFO", `Completed ${stage.name}${newFindings.length ? `; persisted ${newFindings.length} new findings` : ""}`);
    }

    await db.query("update scans set status = 'done', progress = 100, current_stage = 'Done', finished_at = now() where id = $1", [scanId]);
    await appendScanLog(scanId, "INFO", `Scan completed with report ${ctx.reportId}`);
    await publishScanEvent({ type: "done", scanId, reportId: ctx.reportId!, progress: 100, status: "done", at: new Date().toISOString() });
    return ctx;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const message = publicScanError(error);
    await db.query("update scans set status = 'failed', error = $2, current_stage = coalesce(current_stage, 'Failed'), finished_at = now() where id = $1", [scanId, message]);
    await appendScanLog(scanId, "ERROR", message);
    if (detail !== message) await appendScanLog(scanId, "ERROR", `Diagnostic detail: ${detail.slice(0, 1800)}`);
    await publishScanEvent({ type: "failed", scanId, error: message, status: "failed", at: new Date().toISOString() });
    throw error;
  } finally {
    await cleanupContext(ctx);
  }
}
