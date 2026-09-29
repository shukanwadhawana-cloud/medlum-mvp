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

    const response = NextResponse.json({ success: true });
    // Remove browser-side state after logout. Server-side token revocation for
    // self-contained JWTs remains a separate hardening item tracked in ASVS.
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Clear-Site-Data", '"cache", "storage"');
    return response;
  } catch (e) {
    console.error("logout error", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
