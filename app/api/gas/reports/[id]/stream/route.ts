import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid gas report id." }, { status: 400 });
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: gas\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      const tick = async () => {
        try {
          const row = (await db.query(
            `select id,status,progress,current_stage as "currentStage",error,finished_at as "finishedAt" from gas_reports where id=$1`,
            [params.data.id],
          )).rows[0];
          if (!row) {
            send({ type: "failed", error: "Gas report not found." });
            closed = true; controller.close(); return;
          }
          const count = (await db.query("select count(*)::int as count from gas_optimizations where gas_report_id=$1", [params.data.id])).rows[0]?.count ?? 0;
          send({ type: "progress", report: row, optimizationCount: count, at: new Date().toISOString() });
          if (row.status === "done" || row.status === "failed") {
            closed = true; controller.close();
          }
        } catch (error) {
          send({ type: "failed", error: error instanceof Error ? error.message : String(error) });
          closed = true; controller.close();
        }
      };
      controller.enqueue(encoder.encode(`: connected ${new Date().toISOString()}\n\n`));
      await tick();
      const interval = setInterval(() => void tick(), 1800);
      _request.signal.addEventListener("abort", () => { closed = true; clearInterval(interval); controller.close(); });
    },
    cancel() { closed = true; },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
