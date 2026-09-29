import { NextResponse } from "next/server";
// RESTORE IN PROGRESS - see next commit
export async function GET() { return NextResponse.json({ error: "temporary" }, { status: 503 }); }
export async function POST() { return NextResponse.json({ error: "temporary" }, { status: 503 }); }
