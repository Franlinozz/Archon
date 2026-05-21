import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({ error: "Proof logging arrives in Session 3" }, { status: 501 }); }
