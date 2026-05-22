import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid scan id." }, { status: 400 });

  const result = await db.query(
    `select id, source_kind as "sourceKind", source_ref as "sourceRef", network, scan_depth as "scanDepth", protocols, status, progress, current_stage as "currentStage", created_at as "createdAt", started_at as "startedAt", finished_at as "finishedAt", error
     from scans where id = $1`,
    [params.data.id],
  );

  const scan = result.rows[0];
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  return NextResponse.json({ scan });
}
