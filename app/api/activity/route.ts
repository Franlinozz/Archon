import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Real workspace activity feed for the notification bell: reports assembled, proofs logged
// on-chain, and finished/failed scans — newest first. No fabricated events.
export async function GET() {
  try {
    const result = await db.query<{ kind: string; ref: string; label: string; detail: string; at: string }>(
      `select kind, ref, label, detail, at from (
         select 'proof'::text as kind, p.report_id::text as ref, rr.contract_name as label, 'Proof logged on-chain'::text as detail, p.logged_at as at
           from proofs p join reports rr on rr.id = p.report_id where p.tx_hash is not null
         union all
         select 'report'::text, r.id::text, r.contract_name, ('Report assembled · risk ' || r.risk_score)::text, r.created_at
           from reports r
         union all
         select 'scan'::text, s.id::text, coalesce(nullif(s.source_ref, ''), s.scan_depth, 'scan'), ('Scan ' || s.status)::text, coalesce(s.finished_at, s.created_at)
           from scans s where s.status in ('done', 'failed')
         union all
         select 'sentinel'::text, e.watch_id::text, coalesce(w.label, w.address),
                (case e.type
                   when 'bytecode_drift' then 'Sentinel: bytecode drift detected'
                   when 'impl_drift' then 'Sentinel: proxy implementation changed'
                   when 'admin_drift' then 'Sentinel: proxy admin changed'
                   when 'owner_drift' then 'Sentinel: owner changed'
                   when 'rescan_complete' then ('Sentinel: re-scan complete · risk ' || coalesce(e.detail->>'riskAfter', '—'))
                   when 'risk_increased' then ('Sentinel: risk increased to ' || coalesce(e.detail->>'to', '—'))
                   else ('Sentinel: ' || replace(e.type, '_', ' ')) end)::text,
                e.created_at
           from sentinel_events e join sentinel_watches w on w.id = e.watch_id
          where e.type <> 'rescan_started'
       ) e
       where e.at is not null
       order by e.at desc
       limit 12`,
    );
    return NextResponse.json({ events: result.rows });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "activity feed query failed");
    // Degrade to an empty feed rather than erroring the bell.
    return NextResponse.json({ events: [], degraded: true });
  }
}
