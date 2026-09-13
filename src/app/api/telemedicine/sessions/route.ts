import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createJoinToken, createVideoMeetingUrl, getVideoProvider, hashJoinToken } from "@/lib/telemedicine";

function isMissingTableError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error || "");
  return /TelemedicineSession/i.test(msg) && /(does not exist|no such table|P2021|P2010)/i.test(msg);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const sessions = await prisma.telemedicineSession.findMany({
      where: { doctorId: session.doctorId },
      orderBy: { scheduledAt: "asc" },
    });
    return NextResponse.json({ success: true, sessions: sessions.map(({ joinTokenHash, ...item }) => item) });
  } catch (error) {
    console.error("list telemedicine sessions", error);
    if (isMissingTableError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "Video sessions database table is not ready.",
          hint: "Run prisma migrate deploy on the production database so TelemedicineSession exists, then refresh.",
          sessions: [],
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: false, error: "Unable to load video sessions.", sessions: [] }, { status: 500 });
  }
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

    const membership = await prisma.clinicMember.findFirst({
      where: { doctorId: session.doctorId, isActive: true },
      select: { clinicId: true },
    });
    const clinicIdForDoctor = membership?.clinicId || null;
    const patient = await prisma.patient.findFirst({
      where: clinicIdForDoctor
        ? { id: patientId, OR: [{ doctorId: session.doctorId }, { clinicId: clinicIdForDoctor }] }
        : { id: patientId, doctorId: session.doctorId },
      select: { id: true, name: true, clinicId: true },
    });
    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Patient not found for this doctor or clinic. Register the patient first." },
        { status: 404 }
      );
    }

    if (appointmentId) {
      const appointment = await prisma.appointment.findFirst({
        where: { id: appointmentId, doctorId: session.doctorId, patientId },
        select: { id: true },
      });
      if (!appointment) {
        return NextResponse.json(
          { success: false, error: "Appointment does not belong to this patient and doctor." },
          { status: 400 }
        );
      }
    }

    const joinToken = createJoinToken();
    const provider = getVideoProvider();
    const meetingUrl = createVideoMeetingUrl("pending");
    const created = await prisma.telemedicineSession.create({
      data: {
        doctorId: session.doctorId,
        patientId,
        appointmentId,
        clinicId: clinicId || patient.clinicId || clinicIdForDoctor,
        scheduledAt,
        expiresAt,
        status: "Scheduled",
        provider,
        meetingUrl,
        joinTokenHash: hashJoinToken(joinToken),
      },
      select: {
        id: true,
        doctorId: true,
        patientId: true,
        appointmentId: true,
        clinicId: true,
        scheduledAt: true,
        expiresAt: true,
        status: true,
        provider: true,
        meetingUrl: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (provider === "jitsi" && meetingUrl) {
      const finalMeetingUrl = meetingUrl.replace("medlum-pending-", `medlum-${created.id}-`);
      const updated = await prisma.telemedicineSession.update({
        where: { id: created.id },
        data: { meetingUrl: finalMeetingUrl },
        select: {
          id: true,
          doctorId: true,
          patientId: true,
          appointmentId: true,
          clinicId: true,
          scheduledAt: true,
          expiresAt: true,
          status: true,
          provider: true,
          meetingUrl: true,
          startedAt: true,
          endedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return NextResponse.json({ success: true, session: updated, patientName: patient.name, joinToken }, { status: 201 });
    }

    return NextResponse.json({ success: true, session: created, patientName: patient.name, joinToken }, { status: 201 });
  } catch (error) {
    console.error("create telemedicine session", error);
    if (isMissingTableError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "Video sessions database table is not ready.",
          hint: "Run prisma migrate deploy on production so TelemedicineSession exists.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: false, error: "Unable to create telemedicine session." }, { status: 500 });
  }
}
