import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { createAttestation } from "@/lib/attest/service";
import { enqueueAttestation } from "@/lib/queue/attest";
import { redisReady } from "@/lib/queue/redis";

export const dynamic = "force-dynamic";

const schema = z.object({
  address: z.string(),
  contractName: z.string().trim().min(1).max(80),
  compilerVersion: z.enum(["0.8.24", "0.8.30"]),
  optimizerEnabled: z.boolean().default(true),
  optimizerRuns: z.number().int().min(1).max(10_000_000).default(200),
  evmVersion: z.string().trim().max(20).optional(),
  sourceRef: z.string().trim().max(200).optional(),
  sourceFiles: z.array(z.object({ path: z.string().min(1).max(240), source: z.string() })).min(1).max(40),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid attestation request.", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  if (!redisReady()) return NextResponse.json({ error: "Attestation queue is temporarily unavailable." }, { status: 503 });
  try {
    const { id, sourceHash } = await createAttestation({
      address: parsed.data.address.trim(),
      sourceFiles: parsed.data.sourceFiles,
      contractName: parsed.data.contractName,
      compilerVersion: parsed.data.compilerVersion,
      settings: { optimizerEnabled: parsed.data.optimizerEnabled, optimizerRuns: parsed.data.optimizerRuns, evmVersion: parsed.data.evmVersion },
      sourceRef: parsed.data.sourceRef ?? null,
    });
    await enqueueAttestation(id);
    return NextResponse.json({ attestationId: id, sourceHash }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create attestation." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.toLowerCase();
  const rows = (await db.query(
    `select id, address, contract_name as "contractName", compiler_version as "compilerVersion", status, match_type as "matchType", attestation_hash as "attestationHash", created_at as "createdAt"
       from attestations ${address ? "where address=$1" : ""} order by created_at desc limit 25`,
    address ? [address] : [],
  )).rows;
  return NextResponse.json({ attestations: rows });
}
