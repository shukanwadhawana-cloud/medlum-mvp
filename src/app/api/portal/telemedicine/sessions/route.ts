import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPortalSession } from "@/lib/portal-session";

export async function GET() {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.telemedicineSession.findMany({
    where: { patientId: session.patientId },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true, doctorId: true, patientId: true, appointmentId: true, clinicId: true,
      scheduledAt: true, expiresAt: true, status: true, provider: true, meetingUrl: true,
      startedAt: true, endedAt: true, createdAt: true, updatedAt: true,
    },
  });

  return NextResponse.json({ success: true, sessions });
}
