import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { enqueueScan } from "@/lib/queue/scans";
import { redisReady } from "@/lib/queue/redis";

const MAX_SOURCE_BYTES = 350_000;
const scanDepths = ["quick", "deep", "gas-cost", "full-report"] as const;
const protocolIds = ["mETH", "cmETH", "USDY", "Aave V3", "Merchant Moe", "Agni"] as const;

const createScanSchema = z
  .object({
    sourceKind: z.enum(["paste", "address"]),
    sourceCode: z.string().optional(),
    sourceFiles: z.array(z.object({ path: z.string().min(1).max(240), source: z.string() })).max(80).optional(),
    sourceRef: z.string().optional(),
    scanDepth: z.enum(scanDepths),
    protocols: z.array(z.enum(protocolIds)).min(1, "Select at least one protocol coverage target."),
  })
  .superRefine((value, ctx) => {
    if (value.sourceKind === "paste") {
      const code = value.sourceCode?.trim() ?? "";
      if (!code) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceCode"], message: "Paste Solidity source code before running a scan." });
      }
      if (Buffer.byteLength(code, "utf8") > MAX_SOURCE_BYTES) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceCode"], message: "Source code is too large for this scan. Keep pasted code under 350 KB." });
      }
      if (!/pragma\s+solidity/.test(code) || !/contract\s+[A-Za-z_][A-Za-z0-9_]*/.test(code)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceCode"], message: "Source must include a Solidity pragma and at least one contract." });
      }
    }

    if (value.sourceKind === "address") {
      const ref = value.sourceRef?.trim() ?? "";
      if (!ref || !isAddress(ref)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceRef"], message: "Enter a valid Mantle contract address." });
      }
    }
  });

function validationResponse(error: z.ZodError) {
  return NextResponse.json(
    {
      error: "Invalid scan request",
      issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = createScanSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error);

  const input = parsed.data;
  const sourceCode = input.sourceKind === "paste" ? input.sourceCode!.trim() : null;
  const sourceRef = input.sourceKind === "address" ? input.sourceRef!.trim() : null;

  // Step 1: persist the scan. The resilient db layer already retries a transient blip;
  // a failure here means the database is genuinely unreachable.
  let scanId: string | undefined;
  try {
    const result = await db.query<{ id: string }>(
      `insert into scans (source_kind, source_ref, source_code, source_bundle, network, scan_depth, protocols, status, progress, current_stage, created_at)
       values ($1, $2, $3, $4::jsonb, 'mantle-mainnet', $5, $6::jsonb, 'queued', 0, 'Queued', now())
       returning id`,
      [input.sourceKind, sourceRef, sourceCode, input.sourceFiles ? JSON.stringify(input.sourceFiles) : null, input.scanDepth, JSON.stringify(input.protocols)],
    );
    scanId = result.rows[0]?.id;
    if (!scanId) throw new Error("Scan insert did not return an id");
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "create scan: database insert failed");
    return NextResponse.json(
      { error: "Audit database is temporarily unavailable. Your audit was not started — please retry in a moment." },
      { status: 503 },
    );
  }

  // Step 2: enqueue the worker job. Fail fast if Redis isn't live (otherwise the enqueue
  // sits in ioredis's offline queue and the request hangs); also cap a slow enqueue. If
  // this fails the row exists but would hang at "queued" forever, so we mark it failed to
  // avoid an orphan and report precisely.
  try {
    if (!redisReady()) throw new Error("Redis connection is not ready");
    await Promise.race([
      enqueueScan(scanId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("enqueue timeout")), 4_000)),
    ]);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error), scanId }, "create scan: enqueue failed");
    try {
      await db.query(
        "update scans set status='failed', error=$2, current_stage='Failed', finished_at=now() where id=$1",
        [scanId, "Scan queue was unavailable at submission time."],
      );
    } catch (cleanupError) {
      logger.error({ err: cleanupError instanceof Error ? cleanupError.message : String(cleanupError), scanId }, "create scan: failed to mark orphan scan as failed");
    }
    return NextResponse.json(
      { error: "Scan queue is temporarily unavailable. Your audit was not started — please retry in a moment." },
      { status: 503 },
    );
  }

  return NextResponse.json({ scanId }, { status: 201 });
}
