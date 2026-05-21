import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ error: "Scan streaming arrives in Session 1" }, { status: 501 }); }
