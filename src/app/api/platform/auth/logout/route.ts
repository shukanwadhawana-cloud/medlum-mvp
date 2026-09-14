import { NextResponse } from "next/server";
import { destroyPlatformSession } from "@/lib/platform-session";

export async function POST() {
  await destroyPlatformSession();
  return NextResponse.json({ success: true });
}
