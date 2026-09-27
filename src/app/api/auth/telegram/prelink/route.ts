import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createTelegramLinkChallenge, ensureTelegramWebhook, classifyTelegramError, roleRequiresOtp } from "@/lib/otp";
import { normalizeClinicRole } from "@/lib/workflow";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Pre-login Telegram linking.
 * Proves account ownership with Staff Login ID + password (email accepted for migration).
 * Does NOT create a session.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const staffId = String(body.staffId || body.loginId || body.staffCode || "").trim();
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");

    if ((!staffId && !email) || !password) {
      return NextResponse.json({ success: false, error: "Staff Login ID and password required." }, { status: 400 });
    }

    let doctor: { id: string; email: string; passwordHash: string; isActive: boolean; clinicName: string } | null = null;
    if (staffId) {
      const { findDoctorByStaffLoginId } = await import("@/lib/staff-id");
      const resolved = await findDoctorByStaffLoginId(staffId);
      doctor = resolved?.doctor
        ? {
            id: resolved.doctor.id,
            email: resolved.doctor.email,
            passwordHash: resolved.doctor.passwordHash,
            isActive: resolved.doctor.isActive,
            clinicName: resolved.doctor.clinicName,
          }
        : null;
    } else {
      doctor = await prisma.doctor.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true, isActive: true, clinicName: true },
      });
    }

    if (!doctor || !(await verifyPassword(password, doctor.passwordHash))) {
      return NextResponse.json({ success: false, error: "Invalid Staff Login ID or password." }, { status: 401 });
    }

    if (!doctor.isActive) {
      return NextResponse.json({ success: false, error: "This account is deactivated." }, { status: 403 });
    }

    const isOwner = isMedlumOwnerEmail(doctor.email);
    if (!isOwner) {
      const memberships = await prisma.clinicMember.findMany({
        where: { doctorId: doctor.id, isActive: true },
        select: { role: true },
        orderBy: { createdAt: "asc" },
      });
      if (!memberships.some((m) => roleRequiresOtp(normalizeClinicRole(m.role)))) {
        return NextResponse.json({
          success: false,
          error: "Telegram linking is only required for privileged accounts.",
        }, { status: 403 });
      }
    }

    const existing = await prisma.telegramIdentity.findUnique({
      where: { doctorId: doctor.id },
      select: { telegramUsername: true },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyLinked: true,
        telegramUsername: existing.telegramUsername,
        message: "Telegram is already linked to this account.",
      });
    }

    await ensureTelegramWebhook();
    const challenge = await createTelegramLinkChallenge(doctor.id);
    await writeAudit({
      doctorId: doctor.id,
      action: "telegram_prelink_started",
      entity: "Doctor",
      entityId: doctor.id,
      meta: {},
    });

    return NextResponse.json({
      success: true,
      alreadyLinked: false,
      deepLink: challenge.deepLink,
      expiresAt: challenge.expiresAt.toISOString(),
    });
  } catch (e) {
    console.error("telegram prelink", classifyTelegramError(e));
    return NextResponse.json({ success: false, error: "Unable to start Telegram linking." }, { status: 500 });
  }
}
