import { NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { z } from "zod";
import { redis } from "@/lib/queue/redis";
import { parseSiweMessage } from "@/lib/auth/siwe";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { MANTLE_CHAIN_ID } from "@/lib/chain/mantle";

export const dynamic = "force-dynamic";

const schema = z.object({ message: z.string().min(1).max(2000), signature: z.string().regex(/^0x[a-fA-F0-9]+$/) });

// Verify a SIWE signature (no transaction, no gas) and open an httpOnly session.
export async function POST(request: Request) {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const parsed = parseSiweMessage(body.data.message);
  if (!parsed) return NextResponse.json({ error: "Malformed sign-in message." }, { status: 400 });
  if (parsed.chainId !== MANTLE_CHAIN_ID) return NextResponse.json({ error: "Sign-in must target Mantle Mainnet." }, { status: 400 });

  const issued = Date.parse(parsed.issuedAt);
  if (!Number.isFinite(issued) || Date.now() - issued > 10 * 60 * 1000 || issued - Date.now() > 60 * 1000) {
    return NextResponse.json({ error: "Sign-in message expired — try again." }, { status: 400 });
  }

  // One-time nonce: must exist, consumed on use.
  const key = `siwe:nonce:${parsed.nonce}`;
  const exists = await redis.get(key).catch(() => null);
  if (!exists) return NextResponse.json({ error: "Invalid or expired nonce." }, { status: 400 });
  await redis.del(key).catch(() => {});

  let recovered: string;
  try {
    recovered = await recoverMessageAddress({ message: body.data.message, signature: body.data.signature as `0x${string}` });
  } catch {
    return NextResponse.json({ error: "Could not verify signature." }, { status: 401 });
  }
  if (recovered.toLowerCase() !== parsed.address.toLowerCase()) {
    return NextResponse.json({ error: "Signature does not match the signing address." }, { status: 401 });
  }

  const res = NextResponse.json({ address: parsed.address.toLowerCase() });
  res.cookies.set(SESSION_COOKIE, createSessionToken(parsed.address), sessionCookieOptions);
  return res;
}
