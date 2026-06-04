import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { upsertPreparedProof } from "@/lib/proof/report";
import { identityAttestParams, logPreparedProofOnIdentity, verifyAndRecordIdentityUserProof } from "@/lib/proof/identity";
import { archonProofParams, isProofRegistryConfigured, logPreparedProofOnArchonRegistry, verifyAndRecordArchonUserProof } from "@/lib/proof/archonRegistry";
import { getSession } from "@/lib/auth/session";

const paramsSchema = z.object({ id: z.string().uuid() });
const completeSchema = z.union([
  z.object({ action: z.literal("log") }),
  z.object({ action: z.literal("record-self-custody"), txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/) }),
  z.object({ txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/), metadataUri: z.string().min(1).optional() }),
]);

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  const prepared = await upsertPreparedProof(params.data.id);

  // Surface the exact Identity setMetadata params so a connected wallet can submit
  // the identical self-attestation itself (self-custody). Only when configured.
  // Primary anchor = Archon's own deployed ArchonProofRegistry (award-eligible).
  // Until its address is configured (post-deploy), fall back to ERC-8004 Identity
  // self-attestation so proof-logging keeps working with no downtime.
  let selfCustody = null;
  if (prepared.configured) {
    try {
      selfCustody = isProofRegistryConfigured() ? archonProofParams(prepared) : identityAttestParams(params.data.id, prepared);
    } catch {
      selfCustody = null;
    }
  }

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
    selfCustody,
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });

  // Logging a proof (either mode) requires a SIWE session — a free signature, not
  // a transaction. This is the only thing the session gates.
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in with your wallet to log a proof." }, { status: 401 });

  const body = completeSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const data = body.data;

  // Mode 1 — Archon's server (agent owner) self-attests via Identity setMetadata
  // (gasless for the user). Simulation/timeout live inside the function.
  if ("action" in data && data.action === "log") {
    try {
      const result = isProofRegistryConfigured()
        ? await logPreparedProofOnArchonRegistry(params.data.id)
        : await logPreparedProofOnIdentity(params.data.id);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not anchor the proof." }, { status: 400 });
    }
  }

  // Mode 2 — the user already submitted setMetadata from their own wallet; verify
  // and record it. The session address must match the on-chain submitter.
  if ("action" in data && data.action === "record-self-custody") {
    try {
      const result = isProofRegistryConfigured()
        ? await verifyAndRecordArchonUserProof(params.data.id, data.txHash as `0x${string}`, session.address)
        : await verifyAndRecordIdentityUserProof(params.data.id, data.txHash as `0x${string}`, session.address);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify the proof transaction." }, { status: 400 });
    }
  }

  // Legacy: record a bare tx hash.
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
