import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ error: "Reports arrive in Session 2" }, { status: 501 }); }
