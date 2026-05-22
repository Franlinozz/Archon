import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  const result = await db.query<{ metadata: unknown }>(
    `select metadata from proofs where report_id=$1 order by created_at desc limit 1`,
    [params.data.id],
  );
  const metadata = result.rows[0]?.metadata;
  if (!metadata) return NextResponse.json({ error: "Proof metadata not found." }, { status: 404 });
  return NextResponse.json(metadata, { headers: { "cache-control": "public, max-age=300" } });
}
