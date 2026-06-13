import { NextResponse } from "next/server";
import { getObservatory } from "@/lib/observatory/stats";

// Public, no-auth Observatory snapshot — every number traces to stored receipt
// samples or the verified ADR 0007 anchors. Cached 5 min at the edge so the
// embeddable chart and agent consumers don't hammer the DB.
export const revalidate = 300;

export async function GET() {
  try {
    const snapshot = await getObservatory();
    return NextResponse.json({ schema: "archon.observatory.v1", ...snapshot }, { headers: { "cache-control": "public, max-age=300, s-maxage=300" } });
  } catch {
    return NextResponse.json({ schema: "archon.observatory.v1", error: "Observatory is warming up." }, { status: 503 });
  }
}
