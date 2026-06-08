import { NextResponse } from "next/server";
import { z } from "zod";
import { challengeInputSchema, createReportChallenge, listReportChallenges } from "@/lib/challenges/service";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  return NextResponse.json({ schema: "archon.challenges.v1", challenges: await listReportChallenges(params.data.id) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  const parsed = challengeInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid challenge.", issues: parsed.error.issues }, { status: 400 });
  try {
    const challenge = await createReportChallenge(params.data.id, parsed.data);
    return NextResponse.json({ schema: "archon.challenge.v1", challenge }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record challenge." }, { status: 400 });
  }
}
