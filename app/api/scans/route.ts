import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({ error: "Scan creation arrives in Session 1" }, { status: 501 }); }
