import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function POST() {
  try {
    const session = await getSession();
    if (session) {
      await writeAudit({
        doctorId: session.doctorId,
        action: "logout",
        entity: "Doctor",
        entityId: session.doctorId,
      });
    }
    await destroySession();
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("logout error", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
