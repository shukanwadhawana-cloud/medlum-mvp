import { NextResponse } from "next/server";
import { authenticatePlatformOwner } from "@/lib/platform-control-plane";
import { createPlatformSession } from "@/lib/platform-session";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");
    if (!email || !password) return NextResponse.json({ success: false, error: "Email and password required" }, { status: 400 });
    const owner = await authenticatePlatformOwner(email, password);
    if (!owner) return NextResponse.json({ success: false, error: "Invalid platform owner credentials" }, { status: 401 });
    await createPlatformSession({ ownerId: owner.id, email: owner.email });
    return NextResponse.json({ success: true, owner: { id: owner.id, email: owner.email, name: owner.name } });
  } catch (error) {
    console.error("platform owner login error", error);
    return NextResponse.json({ success: false, error: "Platform authentication unavailable" }, { status: 500 });
  }
}
