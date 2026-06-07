import { NextResponse } from "next/server";
import { z } from "zod";
import { createGasReport } from "@/lib/gas/service";
import { enqueueGasScan } from "@/lib/queue/gas";
import { redisReady } from "@/lib/queue/redis";

export const runtime = "nodejs";

const schema = z.object({
  sourceKind: z.enum(["paste", "sample", "address"]).default("paste"),
  sourceCode: z.string().optional(),
  sourceRef: z.string().optional(),
  callsPerYear: z.number().int().positive().max(1_000_000_000).optional(),
  mntUsd: z.number().positive().max(1000).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid gas scan request.", issues: parsed.error.issues }, { status: 400 });
  if (!redisReady()) return NextResponse.json({ error: "Gas scan queue is temporarily unavailable." }, { status: 503 });

  try {
    const report = await createGasReport(parsed.data);
    await enqueueGasScan(report.id);
    return NextResponse.json({ gasReportId: report.id, status: "queued", sourceHash: report.sourceHash, contractName: report.contractName, assumptions: report.assumptions }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create gas scan." }, { status: 400 });
  }
}
