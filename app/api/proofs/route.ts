import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export async function GET() {
  const result = await db.query(
    `select p.id, p.report_id as "reportId", r.contract_name as "contractName", r.risk_score as "riskScore", p.report_hash as "reportHash", p.tx_hash as "txHash", p.metadata_uri as "metadataUri", p.network, p.logged_at as "loggedAt", p.verification_status as "verificationStatus"
     from proofs p join reports r on r.id=p.report_id order by p.logged_at desc nulls last, p.created_at desc limit 50`,
  );
  return NextResponse.json({ proofs: result.rows });
}
