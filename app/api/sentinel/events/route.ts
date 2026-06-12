import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const watchId = new URL(request.url).searchParams.get("watchId");
  const rows = (await db.query(
    `select e.id, e.watch_id as "watchId", e.type, e.detail, e.scan_id as "scanId", e.report_id as "reportId", e.created_at as "createdAt", w.address, w.label
       from sentinel_events e join sentinel_watches w on w.id = e.watch_id
      where w.owner = $1 ${watchId ? "and e.watch_id = $2" : ""}
      order by e.created_at desc limit 50`,
    watchId ? [session.address.toLowerCase(), watchId] : [session.address.toLowerCase()],
  )).rows;
  return NextResponse.json({ events: rows });
}
