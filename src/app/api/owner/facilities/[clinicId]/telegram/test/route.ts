import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { sendFacilityTelegramMessage } from "@/lib/facility-telegram";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const { clinicId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const doctor = await prisma.doctor.findUnique({
    where: { id: session.doctorId },
    select: { email: true },
  });
  if (!doctor || !isMedlumOwnerEmail(doctor.email)) {
    return NextResponse.json({ success: false, error: "Master Owner access required." }, { status: 403 });
  }

  const facility = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } });
  if (!facility) return NextResponse.json({ success: false, error: "Facility not found." }, { status: 404 });

  const result = await sendFacilityTelegramMessage(
    clinicId,
    `MedLum test notification

Facility: ${facility.name}

Facility Telegram routing is working.`
  );

  if (!result.sent) {
    return NextResponse.json({ success: false, error: result.reason || "Telegram delivery failed." }, { status: 503 });
  }

  return NextResponse.json({ success: true, message: "Test notification sent." });
}
