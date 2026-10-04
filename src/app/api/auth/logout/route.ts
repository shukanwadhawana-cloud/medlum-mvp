import { NextResponse } from "next/server";
import { getSession, revokeSession } from "@/lib/session";
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
    if (session) await revokeSession(session.doctorId);
    else {
      const { destroySession } = await import("@/lib/session");
      await destroySession();
    }

    const response = NextResponse.json({ success: true });
    // Remove browser-side state and invalidate the authenticated token server-side.
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Clear-Site-Data", '"cache", "storage"');
    return response;
  } catch (e) {
    console.error("logout error", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
