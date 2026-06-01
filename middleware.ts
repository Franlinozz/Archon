import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifyEdgeSession } from "@/lib/auth/edge-session";

// SIWE is required to enter the workspace. Everything under /app/* is gated
// server-side here; public trust surfaces (/, /docs, /proofs, /r/*, /connect,
// assets, /api/*) are NOT matched and stay open so judges can verify proofs
// without a wallet (amendment B).
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Existing dev-tokens rewrite (still gated, under /app).
  if (pathname === "/app/_dev/tokens") {
    const url = request.nextUrl.clone();
    url.pathname = "/app/dev/tokens";
    return NextResponse.rewrite(url);
  }

  const session = await verifyEdgeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/connect";
    url.search = "";
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app", "/app/:path*"] };
