import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createJoinToken, hashJoinToken, isTelemedicineStatus, sanitizeMeetingUrl } from "@/lib/telemedicine";

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const item = await prisma.telemedicineSession.findFirst({
    where: { id, doctorId: session.doctorId },
    select: sessionSelect,
  });
  if (!item) return NextResponse.json({ success: false, error: "Telemedicine session not found." }, { status: 404 });
  return NextResponse.json({ success: true, session: item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json();
    const status = body.status;
    const regenerateJoinToken = Boolean(body.regenerateJoinToken);
    const meetingUrl = body.meetingUrl === undefined ? undefined : sanitizeMeetingUrl(body.meetingUrl);
    if (status !== undefined && !isTelemedicineStatus(status)) {
      return NextResponse.json({ success: false, error: "Invalid telemedicine status." }, { status: 400 });
    }
    if (body.meetingUrl !== undefined && body.meetingUrl !== null && body.meetingUrl !== "" && !meetingUrl) {
      return NextResponse.json({ success: false, error: "meetingUrl must be a valid HTTPS URL." }, { status: 400 });
    }

    const existing = await prisma.telemedicineSession.findFirst({ where: { id, doctorId: session.doctorId } });
    if (!existing) return NextResponse.json({ success: false, error: "Telemedicine session not found." }, { status: 404 });

    const now = new Date();
    const nextStatus = status ?? existing.status;
    const data: Record<string, unknown> = { status: nextStatus };
    if (meetingUrl !== undefined) data.meetingUrl = meetingUrl;
    if (nextStatus === "Active" && !existing.startedAt) data.startedAt = now;
    if (nextStatus === "Completed" && !existing.endedAt) data.endedAt = now;
    if (nextStatus === "Cancelled" && !existing.endedAt) data.endedAt = now;

    let joinToken: string | undefined;
    if (regenerateJoinToken) {
      joinToken = createJoinToken();
      data.joinTokenHash = hashJoinToken(joinToken);
    }

    const updated = await prisma.telemedicineSession.update({
      where: { id },
      data,
      select: sessionSelect,
    });
    return NextResponse.json({ success: true, session: updated, ...(joinToken ? { joinToken } : {}) });
  } catch (error) {
    console.error("update telemedicine session", error);
    return NextResponse.json({ success: false, error: "Unable to update telemedicine session." }, { status: 500 });
  }
}
