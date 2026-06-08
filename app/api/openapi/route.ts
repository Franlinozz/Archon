import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/api/openapi";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
}
