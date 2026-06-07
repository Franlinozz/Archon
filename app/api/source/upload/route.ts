import { NextResponse } from "next/server";
import { parseSolidityUpload } from "@/lib/source/solidity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const selectedPath = form.get("path");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a .sol file or .zip archive." }, { status: 400 });
    const result = await parseSolidityUpload(file, typeof selectedPath === "string" ? selectedPath : undefined);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload import failed." }, { status: 400 });
  }
}
