import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTestForFinding } from "@/lib/tests/generation";

const paramsSchema = z.object({ id: z.string().uuid(), findingId: z.string().uuid() });

export async function POST(_request: Request, context: { params: Promise<{ id: string; findingId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid report or finding id." }, { status: 400 });
  try {
    const test = await generateTestForFinding(params.data.id, params.data.findingId);
    return NextResponse.json({ ok: true, test });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate finding test." }, { status: 500 });
  }
}
