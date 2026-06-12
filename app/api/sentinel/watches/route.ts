import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { addWatch, freshness } from "@/lib/sentinel/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to use Sentinel." }, { status: 401 });
  const rows = (await db.query(
    `select w.id, w.address, w.label, w.mode, w.source_verified as "sourceVerified", w.status,
            w.last_checked_at as "lastCheckedAt", w.last_drift_at as "lastDriftAt", w.pending_scan_id as "pendingScanId",
            r.id as "reportId", r.risk_score as "riskScore", r.severity_counts as "severityCounts", r.created_at as "reportAt",
            exists(select 1 from proofs p where p.report_id = r.id and p.tx_hash is not null) as anchored,
            (select count(*)::int from sentinel_events e where e.watch_id = w.id and e.type like '%_drift' and (r.created_at is null or e.created_at > r.created_at)) as "driftsSinceReport",
            (select count(*)::int from sentinel_events e where e.watch_id = w.id) as "eventCount"
       from sentinel_watches w left join reports r on r.id = w.last_report_id
      where w.owner = $1 order by w.created_at desc`,
    [session.address.toLowerCase()],
  )).rows as Array<Record<string, unknown>>;

  const watches = rows.map((row) => {
    const counts = (row.severityCounts ?? {}) as Record<string, number>;
    return {
      ...row,
      freshness: freshness({
        lastReportAt: row.reportAt ? String(row.reportAt) : null,
        anchored: Boolean(row.anchored),
        driftsSinceReport: Number(row.driftsSinceReport ?? 0),
        critHigh: Number(counts.critical ?? 0) + Number(counts.high ?? 0),
      }),
    };
  });
  return NextResponse.json({ watches });
}

const createSchema = z.object({ address: z.string(), label: z.string().trim().min(2).max(80).optional() });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to use Sentinel." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid watch request." }, { status: 400 });
  const count = (await db.query<{ n: number }>(`select count(*)::int as n from sentinel_watches where owner=$1 and status='active'`, [session.address.toLowerCase()])).rows[0];
  if ((count?.n ?? 0) >= 25) return NextResponse.json({ error: "Watch limit reached (25 active addresses)." }, { status: 400 });
  try {
    const watch = await addWatch(session.address, parsed.data.address.trim(), parsed.data.label ?? null);
    return NextResponse.json(watch, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add watch." }, { status: 400 });
  }
}
