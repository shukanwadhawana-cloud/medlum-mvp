import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { findAuthorizedPatient, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { createJoinToken, createVideoMeetingUrl, hashJoinToken } from "@/lib/telemedicine";

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

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId") || undefined;
    const membership = await requireActiveClinicMembership(session.doctorId);
    const clinicId = membership?.clinicId || null;

    const items = await prisma.telemedicineSession.findMany({
      where: {
        doctorId: session.doctorId,
        ...(patientId ? { patientId } : {}),
        ...(clinicId ? { OR: [{ clinicId }, { clinicId: null }] } : {}),
      },
      orderBy: { scheduledAt: "desc" },
      take: 50,
      select: sessionSelect,
    });
    return NextResponse.json({ success: true, sessions: items });
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ success: true, sessions: [], setupRequired: true });
    }
    console.error("list telemedicine sessions", error);
    return NextResponse.json({ success: false, error: "Unable to list telemedicine sessions." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const sessionKind = body.sessionKind === "peer" ? "peer" : "patient";
    const peerLabel = typeof body.peerLabel === "string" ? body.peerLabel.trim().slice(0, 120) : null;
    const patientIdRaw = typeof body.patientId === "string" ? body.patientId.trim() : "";
    const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId.trim() : null;
    const scheduledAtRaw = body.scheduledAt;
    const expiresAtRaw = body.expiresAt;

    if (sessionKind === "patient" && !patientIdRaw) {
      return NextResponse.json({ success: false, error: "patientId is required for patient sessions." }, { status: 400 });
    }

    const membership = await requireActiveClinicMembership(session.doctorId);
    if (!membership) {
      return NextResponse.json({ success: false, error: "No active clinic membership." }, { status: 403 });
    }
    const clinicIdForDoctor = membership.clinicId || null;

    let patientClinicId: string | null = null;
    let patientName: string | undefined;
    if (sessionKind === "patient") {
      const patient = await findAuthorizedPatient(membership, patientIdRaw);
      if (!patient) {
        return NextResponse.json({ success: false, error: "Patient not found in selected facility." }, { status: 404 });
      }
      patientClinicId = patient.clinicId || clinicIdForDoctor;
      patientName = patient.name;

      if (appointmentId) {
        const appt = await prisma.appointment.findFirst({
          where: { id: appointmentId, doctorId: session.doctorId, patientId: patientIdRaw },
          select: { id: true },
        });
        if (!appt) {
          return NextResponse.json({ success: false, error: "Appointment not found for this patient." }, { status: 404 });
        }
      }

      const existing = await prisma.telemedicineSession.findFirst({
        where: {
          doctorId: session.doctorId,
          patientId: patientIdRaw,
          status: { in: ["Scheduled", "Waiting", "Active"] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { scheduledAt: "desc" },
        select: sessionSelect,
      });
      if (existing) {
        return NextResponse.json(
          {
            success: true,
            session: existing,
            patientName,
            sessionKind: "patient",
            reused: true,
          },
          { status: 200 }
        );
      }
    }

    const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : new Date();
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ success: false, error: "Invalid scheduledAt." }, { status: 400 });
    }
    const expiresAt = expiresAtRaw
      ? new Date(expiresAtRaw)
      : new Date(scheduledAt.getTime() + 24 * 60 * 60 * 1000);
    if (Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ success: false, error: "Invalid expiresAt." }, { status: 400 });
    }

    const joinToken = createJoinToken();
    const provider = "mirotalk"; // Jitsi disabled — MiroTalk only
    const meetingUrl = createVideoMeetingUrl();
    const created = await prisma.telemedicineSession.create({
      data: {
        doctorId: session.doctorId,
        patientId: sessionKind === "patient" ? patientIdRaw : null,
        appointmentId: sessionKind === "patient" ? appointmentId : null,
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
        patientId: created.patientId,
        appointmentId: created.appointmentId,
        provider,
        scheduledAt: scheduledAt.toISOString(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        session: created,
        joinToken,
        sessionKind,
        patientName,
      },
      { status: 201 }
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { success: false, error: "Telemedicine is not set up on this database yet." },
        { status: 503 }
      );
    }
    console.error("create telemedicine session", error);
    return NextResponse.json({ success: false, error: "Unable to create telemedicine session." }, { status: 500 });
  }
}
