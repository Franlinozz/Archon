import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const params = paramsSchema.safeParse(await context.params);
  const body = z.object({ status: z.enum(["active", "paused"]) }).safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const result = await db.query(`update sentinel_watches set status=$3 where id=$1 and owner=$2`, [params.data.id, session.address.toLowerCase(), body.data.status]);
  if (!result.rowCount) return NextResponse.json({ error: "Watch not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const result = await db.query(`delete from sentinel_watches where id=$1 and owner=$2`, [params.data.id, session.address.toLowerCase()]);
  if (!result.rowCount) return NextResponse.json({ error: "Watch not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
