import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = z.object({ id: z.string().uuid() }).safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid attestation id." }, { status: 400 });
  const row = (await db.query(
    `select id, address, chain_id as "chainId", source_ref as "sourceRef", contract_name as "contractName", compiler_version as "compilerVersion", settings, source_hash as "sourceHash",
            status, match_type as "matchType", onchain_bytecode_hash as "onchainBytecodeHash", compiled_bytecode_hash as "compiledBytecodeHash", attestation_hash as "attestationHash",
            detail, error, created_at as "createdAt", finished_at as "finishedAt"
       from attestations where id=$1`,
    [params.data.id],
  )).rows[0];
  if (!row) return NextResponse.json({ error: "Attestation not found." }, { status: 404 });
  return NextResponse.json({ attestation: row });
}
