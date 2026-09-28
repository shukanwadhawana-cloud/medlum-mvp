import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { findAuthorizedPatient, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { createJoinToken, createVideoMeetingUrl, getVideoProvider, hashJoinToken } from "@/lib/telemedicine";

function isMissingTableError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error || "");
  return /TelemedicineSession/i.test(msg) && /(does not exist|no such table|P2021|P2010)/i.test(msg);
}

const sessionSelect = {
  id: true,
  doctorId: true,
  patientId: true,
  appointmentId: true,
  clinicId: true,
  sessionKind: true,
  peerLabel: true,
  scheduledAt: true,
  expiresAt: true,
  status: true,
  provider: true,
  meetingUrl: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

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
          hint: "Redeploy so the container runs prisma migrate deploy, then refresh.",
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
    const sessionKind = String(body.sessionKind || "patient").toLowerCase() === "peer" ? "peer" : "patient";
    const patientIdRaw = String(body.patientId || "").trim();
    const peerLabel = String(body.peerLabel || "").trim() || null;
    const appointmentId = body.appointmentId ? String(body.appointmentId).trim() : null;
    const scheduledAt = new Date(String(body.scheduledAt || ""));
    const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;

    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ success: false, error: "A valid scheduledAt is required." }, { status: 400 });
    }
    if (sessionKind === "patient" && !patientIdRaw) {
      return NextResponse.json({ success: false, error: "Select a patient, or switch to Consultant peer call." }, { status: 400 });
    }
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ success: false, error: "expiresAt must be a valid date." }, { status: 400 });
    }
    if (expiresAt && expiresAt <= scheduledAt) {
      return NextResponse.json({ success: false, error: "expiresAt must be after scheduledAt." }, { status: 400 });
    }

    const membership = await requireActiveClinicMembership(session.doctorId);
    if (!membership) return NextResponse.json({ success: false, error: "No active facility membership." }, { status: 403 });
    const clinicIdForDoctor = membership.clinicId;

    let patientId: string | null = null;
    let patientName: string | null = null;
    let patientClinicId: string | null = null;

    if (sessionKind === "patient") {
      const patient = await findAuthorizedPatient(membership, patientIdRaw);
      if (!patient) {
        return NextResponse.json(
          { success: false, error: "Patient not found for this doctor or clinic. Register the patient first." },
          { status: 404 }
        );
      }
      patientId = patient.id;
      patientName = patient.name;
      patientClinicId = patient.clinicId;

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

        const existing = await prisma.telemedicineSession.findFirst({
          where: {
            appointmentId,
            status: { notIn: ["Completed", "Cancelled", "Expired"] },
          },
          orderBy: { createdAt: "desc" },
          select: sessionSelect,
        });
        if (existing) {
          return NextResponse.json(
            {
              success: true,
              reused: true,
              session: existing,
              patientName: patient.name,
              sessionKind: "patient",
            },
            { status: 200 }
          );
        }
      }
    }

    const joinToken = createJoinToken();
    const provider = getVideoProvider();
    const meetingUrl = createVideoMeetingUrl();
    const created = await prisma.telemedicineSession.create({
      data: {
        doctorId: session.doctorId,
        patientId,
        appointmentId: sessionKind === "patient" ? appointmentId : null,
        // Facility scope is always derived server-side; never trust a client clinicId.
        clinicId: patientClinicId || clinicIdForDoctor,
        sessionKind,
        peerLabel: sessionKind === "peer" ? peerLabel || "Consultant peer call" : null,
        scheduledAt,
        expiresAt,
        status: "Scheduled",
        provider,
        meetingUrl,
        joinTokenHash: hashJoinToken(joinToken),
      },
      select: sessionSelect,
    });

    await writeAudit({
      doctorId: session.doctorId,
      clinicId: clinicIdForDoctor,
      action: "TELEMEDICINE_SESSION_CREATED",
      entity: "TelemedicineSession",
      entityId: created.id,
      meta: {
        sessionKind,
        patientId,
        appointmentId: created.appointmentId,
        provider,
        scheduledAt: scheduledAt.toISOString(),
      },
    });

    // meetingUrl is final high-entropy room (mirotalk/jitsi); no PHI in path
    return NextResponse.json(
      {
        success: true,
        session: created,
        patientName: patientName || peerLabel || "Peer consultant",
        joinToken,
        sessionKind,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("create telemedicine session", error);
    if (isMissingTableError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "Video sessions database table is not ready.",
          hint: "Redeploy so the container runs prisma migrate deploy.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: false, error: "Unable to create telemedicine session." }, { status: 500 });
  }
}
