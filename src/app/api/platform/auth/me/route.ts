import { NextResponse } from "next/server";
import { getPlatformSession } from "@/lib/platform-session";

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ success: false, error: "Platform owner authentication required" }, { status: 401 });
  return NextResponse.json({ success: true, owner: session });
}
