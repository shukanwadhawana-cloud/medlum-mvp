import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createJoinToken, hashJoinToken } from "@/lib/telemedicine";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.telemedicineSession.findMany({
    where: { doctorId: session.doctorId },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json({ success: true, sessions: sessions.map(({ joinTokenHash, ...item }) => item) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const patientId = String(body.patientId || "").trim();
    const appointmentId = body.appointmentId ? String(body.appointmentId).trim() : null;
    const clinicId = body.clinicId ? String(body.clinicId).trim() : null;
    const scheduledAt = new Date(String(body.scheduledAt || ""));
    const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;

    if (!patientId || Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ success: false, error: "patientId and a valid scheduledAt are required." }, { status: 400 });
    }
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ success: false, error: "expiresAt must be a valid date." }, { status: 400 });
    }
    if (expiresAt && expiresAt <= scheduledAt) {
      return NextResponse.json({ success: false, error: "expiresAt must be after scheduledAt." }, { status: 400 });
    }

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, doctorId: session.doctorId },
      select: { id: true, name: true, clinicId: true },
    });
    if (!patient) return NextResponse.json({ success: false, error: "Patient not found for this doctor." }, { status: 404 });

    if (appointmentId) {
      const appointment = await prisma.appointment.findFirst({
        where: { id: appointmentId, doctorId: session.doctorId, patientId },
        select: { id: true },
      });
      if (!appointment) return NextResponse.json({ success: false, error: "Appointment does not belong to this patient and doctor." }, { status: 400 });
    }

    const joinToken = createJoinToken();
    const created = await prisma.telemedicineSession.create({
      data: {
        doctorId: session.doctorId,
        patientId,
        appointmentId,
        clinicId: clinicId || patient.clinicId,
        scheduledAt,
        expiresAt,
        status: "Scheduled",
        provider: "external",
        joinTokenHash: hashJoinToken(joinToken),
      },
      select: {
        id: true, doctorId: true, patientId: true, appointmentId: true, clinicId: true,
        scheduledAt: true, expiresAt: true, status: true, provider: true, meetingUrl: true,
        startedAt: true, endedAt: true, createdAt: true, updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, session: created, patientName: patient.name, joinToken }, { status: 201 });
  } catch (error) {
    console.error("create telemedicine session", error);
    return NextResponse.json({ success: false, error: "Unable to create telemedicine session." }, { status: 500 });
  }
}
