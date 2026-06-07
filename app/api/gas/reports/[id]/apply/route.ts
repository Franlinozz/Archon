import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { enqueueGasApply } from "@/lib/queue/gas";
import { redisReady } from "@/lib/queue/redis";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ optId: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid gas report id." }, { status: 400 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid apply request." }, { status: 400 });

  const opt = (await db.query<{ id: string; gasDiff: { patchedSource?: string } | null; status: string }>(
    `select id, gas_diff as "gasDiff", status from gas_optimizations where gas_report_id=$1 and id=$2`,
    [params.data.id, body.data.optId],
  )).rows[0];
  if (!opt) return NextResponse.json({ error: "Gas optimization not found." }, { status: 404 });
  if (opt.gasDiff?.patchedSource) return NextResponse.json({ status: "ready", patchedSource: opt.gasDiff.patchedSource, gasDiff: opt.gasDiff });
  if (!redisReady()) return NextResponse.json({ error: "Gas apply queue is temporarily unavailable." }, { status: 503 });

  await enqueueGasApply(params.data.id, body.data.optId);
  await db.query("update gas_optimizations set status='patch-queued' where gas_report_id=$1 and id=$2", [params.data.id, body.data.optId]);
  return NextResponse.json({ status: "queued", gasReportId: params.data.id, optId: body.data.optId, message: "Patch compilation and gas diff are running in the worker. Repeat this request or GET the optimization to retrieve the cached result." }, { status: 202 });
}
