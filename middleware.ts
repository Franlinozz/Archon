import { NextRequest, NextResponse } from "next/server";
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/app/_dev/tokens") {
    const url = request.nextUrl.clone();
    url.pathname = "/app/dev/tokens";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/app/_dev/tokens"] };
