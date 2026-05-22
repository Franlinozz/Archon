import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { upsertPreparedProof } from "@/lib/proof/report";
import { logPreparedProofOnReputation } from "@/lib/proof/reputation";

const paramsSchema = z.object({ id: z.string().uuid() });
const completeSchema = z.union([
  z.object({ action: z.literal("log") }),
  z.object({ txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/), metadataUri: z.string().min(1).optional() }),
]);

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  const prepared = await upsertPreparedProof(params.data.id);
  return NextResponse.json({
    proofId: prepared.proofId,
    reportHash: prepared.reportHash,
    metadataUri: prepared.metadataUri,
    metadata: prepared.metadata,
    network: prepared.network,
    chainId: prepared.chainId,
    configured: prepared.configured,
    blocker: prepared.blocker,
    gasEstimate: prepared.configured ? null : "Unavailable until verified ERC-8004 registries are configured.",
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  const body = completeSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Invalid transaction hash." }, { status: 400 });
  const data = body.data;
  if ("action" in data && data.action === "log") {
    const result = await logPreparedProofOnReputation(params.data.id);
    return NextResponse.json(result);
  }
  if (!("txHash" in data)) return NextResponse.json({ error: "Invalid transaction hash." }, { status: 400 });
  const result = await db.query(
    `update proofs set tx_hash=$2, metadata_uri=coalesce($3,metadata_uri), verification_status='proof_logged', logged_at=now()
     where report_id=$1 returning id, report_hash as "reportHash", tx_hash as "txHash", metadata_uri as "metadataUri", verification_status as "verificationStatus"`,
    [params.data.id, data.txHash, data.metadataUri ?? null],
  );
  const row = result.rows[0];
  if (!row) return NextResponse.json({ error: "Prepared proof not found." }, { status: 404 });
  return NextResponse.json(row);
}
