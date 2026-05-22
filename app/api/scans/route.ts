import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { enqueueScan } from "@/lib/queue/scans";

const MAX_SOURCE_BYTES = 350_000;
const scanDepths = ["quick", "deep", "gas-cost", "full-report"] as const;
const protocolIds = ["mETH", "cmETH", "USDY", "Aave V3", "Merchant Moe", "Agni"] as const;

const createScanSchema = z
  .object({
    sourceKind: z.enum(["paste", "address"]),
    sourceCode: z.string().optional(),
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

  try {
    const result = await db.query<{ id: string }>(
      `insert into scans (source_kind, source_ref, source_code, network, scan_depth, protocols, status, progress, current_stage, created_at)
       values ($1, $2, $3, 'mantle-mainnet', $4, $5::jsonb, 'queued', 0, 'Queued', now())
       returning id`,
      [input.sourceKind, sourceRef, sourceCode, input.scanDepth, JSON.stringify(input.protocols)],
    );

    const scanId = result.rows[0]?.id;
    if (!scanId) throw new Error("Scan insert did not return an id");

    await enqueueScan(scanId);
    return NextResponse.json({ scanId }, { status: 201 });
  } catch (error) {
    console.error("create scan failed", error);
    return NextResponse.json({ error: "Unable to create scan. Check database and queue connectivity." }, { status: 500 });
  }
}
