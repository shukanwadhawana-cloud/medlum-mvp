import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { createFacilityTelegramConnection, ensureFacilityTelegramWebhook } from "@/lib/facility-telegram";

export const runtime = "nodejs";

async function owner() {
  const session = await getSession();
  if (!session) return null;
  const doctor = await prisma.doctor.findUnique({
    where: { id: session.doctorId },
    select: { id: true, email: true },
  });
  if (!doctor || !isMedlumOwnerEmail(doctor.email)) return null;
  return doctor;
}

export async function POST(_req: Request, { params }: { params: { clinicId: string } }) {
  const user = await owner();
  if (!user) return NextResponse.json({ success: false, error: "Master Owner access required." }, { status: 403 });

  const integration = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId: params.clinicId },
    select: { clinicId: true, enabled: true },
  });
  if (!integration?.enabled) {
    return NextResponse.json({ success: false, error: "Facility Telegram is not configured." }, { status: 404 });
  }

  try {
    await ensureFacilityTelegramWebhook(params.clinicId);
    const connection = await createFacilityTelegramConnection(params.clinicId);
    return NextResponse.json({ success: true, ...connection });
  } catch (error) {
    console.error("[MedLum Facility Telegram] connection setup failed", {
      clinicId: params.clinicId,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ success: false, error: "Could not prepare the Telegram connection. Check the facility Telegram configuration." }, { status: 500 });
  }
}
