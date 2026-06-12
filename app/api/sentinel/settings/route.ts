import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const row = (await db.query<{ webhook_url: string | null }>(`select webhook_url from sentinel_settings where owner=$1`, [session.address.toLowerCase()])).rows[0];
  return NextResponse.json({ webhookUrl: row?.webhook_url ?? null });
}

const putSchema = z.object({ webhookUrl: z.string().url().max(500).nullable() });

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "webhookUrl must be a valid URL or null." }, { status: 400 });
  await db.query(
    `insert into sentinel_settings (owner, webhook_url, updated_at) values ($1,$2,now())
     on conflict (owner) do update set webhook_url=excluded.webhook_url, updated_at=now()`,
    [session.address.toLowerCase(), parsed.data.webhookUrl],
  );
  return NextResponse.json({ ok: true });
}
