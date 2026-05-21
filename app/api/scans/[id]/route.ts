import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ error: "Scan status arrives in Session 1" }, { status: 501 }); }
