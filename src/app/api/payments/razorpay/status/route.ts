import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getRazorpayConfigStatus } from "@/lib/razorpay-config";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ success: true, credentials: await getRazorpayConfigStatus() });
}
