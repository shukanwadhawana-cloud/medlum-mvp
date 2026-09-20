import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createTelegramLinkChallenge, roleRequiresOtp } from "@/lib/otp";
import { normalizeClinicRole } from "@/lib/workflow";
import { isMedlumOwnerEmail } from "@/lib/owner";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const doctor = await prisma.doctor.findUnique({
    where: { id: session.doctorId },
    select: { id: true, email: true, isActive: true },
  });
  if (!doctor?.isActive) return NextResponse.json({ success: false, error: "Account unavailable." }, { status: 403 });

  const membership = await prisma.clinicMember.findFirst({
    where: { doctorId: doctor.id, isActive: true },
    select: { role: true },
    orderBy: { createdAt: "asc" },
  });
  const isOwner = isMedlumOwnerEmail(doctor.email);
  if (!isOwner && !roleRequiresOtp(normalizeClinicRole(membership?.role))) {
    return NextResponse.json({ success: false, error: "Telegram linking is restricted to privileged accounts." }, { status: 403 });
  }

  const username = String(process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
  if (!username) return NextResponse.json({ success: false, error: "Telegram bot is not configured." }, { status: 503 });

  const { token, expiresAt } = await createTelegramLinkChallenge(doctor.id);
  return NextResponse.json({
    success: true,
    expiresAt: expiresAt.toISOString(),
    deepLink: `https://t.me/${username}?start=${encodeURIComponent(token)}`,
  });
}
