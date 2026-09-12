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
      doctor: { select: { name: true, clinicName: true } },
      patient: { select: { name: true } },
    },
  });

  if (!session) return NextResponse.json({ success: false, error: "Invalid or expired join token." }, { status: 401 });
  if (["Cancelled", "Completed", "Expired"].includes(session.status)) {
    return NextResponse.json({ success: false, error: "This telemedicine session is no longer joinable.", status: session.status }, { status: 410 });
  }
  if (session.expiresAt && session.expiresAt <= new Date()) {
    return NextResponse.json({ success: false, error: "This telemedicine session has expired." }, { status: 410 });
  }

  return NextResponse.json({
    success: true,
    session: {
      id: session.id,
      doctorId: session.doctorId,
      patientId: session.patientId,
      appointmentId: session.appointmentId,
      clinicId: session.clinicId,
      scheduledAt: session.scheduledAt,
      expiresAt: session.expiresAt,
      status: session.status,
      provider: session.provider,
      meetingUrl: session.meetingUrl,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      doctor: session.doctor,
      patient: session.patient,
    },
  });
}
