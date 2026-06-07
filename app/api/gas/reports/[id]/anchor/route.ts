import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { anchorGasReport } from "@/lib/gas/service";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid gas report id." }, { status: 400 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in with your wallet to anchor a gas report proof." }, { status: 401 });
  try {
    const result = await anchorGasReport(params.data.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not anchor gas report." }, { status: 400 });
  }
}
