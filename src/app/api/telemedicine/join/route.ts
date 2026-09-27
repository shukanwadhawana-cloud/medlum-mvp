import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashJoinToken } from "@/lib/telemedicine";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token || token.length < 32) return NextResponse.json({ success: false, error: "A valid join token is required." }, { status: 401 });

  const session = await prisma.telemedicineSession.findUnique({
    where: { joinTokenHash: hashJoinToken(token) },
    select: {
      id: true, doctorId: true, patientId: true, appointmentId: true, clinicId: true,
      scheduledAt: true, expiresAt: true, status: true, provider: true, meetingUrl: true,
      startedAt: true, endedAt: true,
    },
  });

  let participant: { id: string; name: string; role: string } | null = null;
  let resolvedSession = session;
  if (!resolvedSession) {
    const invited = await prisma.telemedicineParticipant.findUnique({
      where: { tokenHash: hashJoinToken(token) },
      select: {
        id: true, name: true, role: true, status: true,
        session: {
          select: {
            id: true, doctorId: true, patientId: true, appointmentId: true, clinicId: true,
            scheduledAt: true, expiresAt: true, status: true, provider: true, meetingUrl: true,
            startedAt: true, endedAt: true,
          },
        },
      },
    });
    if (!invited || invited.status === "REVOKED") {
      return NextResponse.json({ success: false, error: "Invalid or revoked participant link." }, { status: 401 });
    }
    participant = { id: invited.id, name: invited.name, role: invited.role };
    resolvedSession = invited.session;
    if (resolvedSession.status === "Active") {
      await prisma.telemedicineParticipant.update({ where: { id: invited.id }, data: { status: "JOINED", joinedAt: new Date() } });
    }
  }

  if (!resolvedSession) return NextResponse.json({ success: false, error: "Invalid or expired join token." }, { status: 401 });
  if (["Cancelled", "Completed", "Expired"].includes(resolvedSession.status)) {
    return NextResponse.json({ success: false, error: "This telemedicine session is no longer joinable.", status: resolvedSession.status }, { status: 410 });
  }
  if (resolvedSession.expiresAt && resolvedSession.expiresAt <= new Date()) {
    return NextResponse.json({ success: false, error: "This telemedicine session has expired." }, { status: 410 });
  }

  return NextResponse.json({
    success: true,
    session: {
      id: resolvedSession.id,
      doctorId: resolvedSession.doctorId,
      patientId: resolvedSession.patientId,
      appointmentId: resolvedSession.appointmentId,
      clinicId: resolvedSession.clinicId,
      scheduledAt: resolvedSession.scheduledAt,
      expiresAt: resolvedSession.expiresAt,
      status: resolvedSession.status,
      provider: resolvedSession.provider,
      meetingUrl: resolvedSession.meetingUrl,
      startedAt: resolvedSession.startedAt,
      endedAt: resolvedSession.endedAt,
      ...(participant ? { participant } : {}),
    },
  });
}
