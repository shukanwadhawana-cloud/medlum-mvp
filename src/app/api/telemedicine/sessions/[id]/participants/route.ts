import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createJoinToken, hashJoinToken } from "@/lib/telemedicine";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const session = await prisma.telemedicineSession.findFirst({
    where: { id, doctorId: auth.doctorId },
    select: { id: true },
  });
  if (!session) return NextResponse.json({ success: false, error: "Telemedicine session not found." }, { status: 404 });

  const participants = await prisma.telemedicineParticipant.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, role: true, status: true, joinedAt: true, revokedAt: true, createdAt: true },
  });
  return NextResponse.json({ success: true, participants });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json();
    const name = String(body.name || "").trim().slice(0, 120);
    const role = String(body.role || "Guest").trim().slice(0, 80) || "Guest";
    if (!name) return NextResponse.json({ success: false, error: "Participant name is required." }, { status: 400 });

    const session = await prisma.telemedicineSession.findFirst({
      where: { id, doctorId: auth.doctorId },
      select: { id: true, status: true, expiresAt: true },
    });
    if (!session) return NextResponse.json({ success: false, error: "Telemedicine session not found." }, { status: 404 });
    if (["Completed", "Cancelled", "Expired"].includes(session.status)) {
      return NextResponse.json({ success: false, error: "This consultation has ended." }, { status: 410 });
    }
    if (session.expiresAt && session.expiresAt <= new Date()) {
      return NextResponse.json({ success: false, error: "This consultation has expired." }, { status: 410 });
    }

    const token = createJoinToken();
    const participant = await prisma.telemedicineParticipant.create({
      data: { sessionId: id, name, role, tokenHash: hashJoinToken(token) },
      select: { id: true, name: true, role: true, status: true, joinedAt: true, revokedAt: true, createdAt: true },
    });

    return NextResponse.json({ success: true, participant, joinToken: token }, { status: 201 });
  } catch (error) {
    console.error("create telemedicine participant", error);
    return NextResponse.json({ success: false, error: "Unable to invite participant." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const participantId = new URL(req.url).searchParams.get("participantId")?.trim();
  if (!participantId) return NextResponse.json({ success: false, error: "participantId is required." }, { status: 400 });

  const existing = await prisma.telemedicineParticipant.findFirst({
    where: { id: participantId, session: { id, doctorId: auth.doctorId } },
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Participant not found." }, { status: 404 });

  const participant = await prisma.telemedicineParticipant.update({
    where: { id: participantId },
    data: { status: "REVOKED", revokedAt: new Date() },
    select: { id: true, name: true, role: true, status: true, joinedAt: true, revokedAt: true, createdAt: true },
  });
  return NextResponse.json({ success: true, participant });
}
