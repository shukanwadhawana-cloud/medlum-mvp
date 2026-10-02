export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { ensurePrimaryClinic } from "@/lib/ensure-clinic";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { AUTH_LIMITS, authBucketKey, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { issueLoginOtp, roleRequiresOtp } from "@/lib/otp";
import { normalizeClinicRole } from "@/lib/workflow";
import { findDoctorByStaffLoginId, isStaffLoginIdFormat, normalizeStaffLoginId } from "@/lib/staff-id";

/**
 * Staff authentication:
 * Primary identifier = MedLum Staff Login ID (ClinicMember.staffCode), e.g. CL01038020.
 * Email remains profile/recovery only. Optional legacy email login for migration safety.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const password = String(body.password || "");
    const staffIdRaw = String(body.staffId || body.loginId || body.staffCode || "").trim();
    const emailRaw = String(body.email || "").toLowerCase().trim();

    const identifier = staffIdRaw || emailRaw;
    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, error: "Staff Login ID and password are required" },
        { status: 400 }
      );
    }

    const rl = await consumeRateLimit(
      authBucketKey("login", req, identifier.toLowerCase()),
      AUTH_LIMITS.login.limit,
      AUTH_LIMITS.login.windowMs
    );
    if (!rl.allowed) {
      const { body: b, headers } = rateLimitResponse(rl.retryAfterSec);
      return NextResponse.json(b, { status: 429, headers });
    }

    let doctor: {
      id: string;
      name: string;
      email: string;
      passwordHash: string;
      clinicName: string;
      phone: string;
      isActive: boolean;
      createdAt: Date;
    } | null = null;
    let resolvedStaffCode = "";

    const looksLikeEmail = identifier.includes("@");
    const looksLikeStaffId = isStaffLoginIdFormat(identifier) || (!looksLikeEmail && staffIdRaw);

    if (looksLikeStaffId && !looksLikeEmail) {
      const resolved = await findDoctorByStaffLoginId(identifier);
      if (resolved) {
        doctor = resolved.doctor;
        resolvedStaffCode = resolved.membership?.staffCode || normalizeStaffLoginId(identifier);
      }
    } else if (looksLikeEmail) {
      doctor = await prisma.doctor.findUnique({ where: { email: identifier } });
    } else {
      const resolved = await findDoctorByStaffLoginId(identifier);
      if (resolved) {
        doctor = resolved.doctor;
        resolvedStaffCode = resolved.membership?.staffCode || normalizeStaffLoginId(identifier);
      } else {
        doctor = await prisma.doctor.findUnique({
          where: { email: identifier.toLowerCase() },
        });
      }
    }

    if (!doctor || !(await verifyPassword(password, doctor.passwordHash))) {
      await writeAudit({
        doctorId: doctor?.id,
        action: "login_failed",
        entity: "Doctor",
        entityId: doctor?.id,
        meta: { identifierType: looksLikeEmail ? "email" : "staffId" },
      });
      return NextResponse.json(
        { success: false, error: "Invalid Staff Login ID or password" },
        { status: 401 }
      );
    }

    if (!doctor.isActive) {
      return NextResponse.json(
        { success: false, error: "This account is deactivated. Contact MedLum support." },
        { status: 403 }
      );
    }

    const isOwner = isMedlumOwnerEmail(doctor.email);
    if (!isOwner) {
      try {
        await ensurePrimaryClinic(doctor.id, doctor.clinicName);
      } catch (clinicErr) {
        console.error("login ensurePrimaryClinic failed", clinicErr instanceof Error ? clinicErr.message : "error");
        // Non-fatal for sign-in: membership query below still proceeds.
      }
    }

    const memberships = await prisma.clinicMember.findMany({
      where: { doctorId: doctor.id, isActive: true },
      select: { role: true, clinicId: true, staffCode: true },
      orderBy: { createdAt: "asc" },
    });
    const membership = memberships[0];
    const primaryRole = isOwner ? "Owner" : normalizeClinicRole(membership?.role);
    if (!resolvedStaffCode) {
      resolvedStaffCode = memberships.find((m) => m.staffCode)?.staffCode || "";
    }
    const requiresPrivilegedOtp =
      isOwner || memberships.some((m) => roleRequiresOtp(normalizeClinicRole(m.role)));

    if (requiresPrivilegedOtp) {
      try {
        const issued = await issueLoginOtp({ doctorId: doctor.id, clinicId: membership?.clinicId });
        return NextResponse.json({
          success: true,
          requiresOtp: true,
          challengeId: issued.challengeId,
          expiresAt: issued.expiresAt.toISOString(),
          deliveryChannel: issued.delivery.channel,
          ...(issued.delivery.devCode ? { devOtp: issued.delivery.devCode } : {}),
          doctor: {
            id: doctor.id,
            name: doctor.name,
            email: doctor.email,
            primaryRole,
            staffCode: resolvedStaffCode,
          },
        });
      } catch (otpErr) {
        console.error("login otp issue failed", otpErr instanceof Error ? otpErr.message : "error");
        const message =
          otpErr instanceof Error && otpErr.message.includes("not linked")
            ? "Telegram is not linked to this account. Link Telegram first."
            : "Unable to send verification code. Contact MedLum support if this continues.";
        return NextResponse.json(
          {
            success: false,
            error: message,
            requiresTelegramLink: message.includes("not linked"),
          },
          { status: 503 }
        );
      }
    }

    await createSession({ doctorId: doctor.id, email: doctor.email });
    await writeAudit({
      doctorId: doctor.id,
      action: "login",
      entity: isOwner ? "PlatformOwner" : "Doctor",
      entityId: doctor.id,
      meta: { isOwner, primaryRole, staffCode: resolvedStaffCode },
    });

    return NextResponse.json({
      success: true,
      requiresOtp: false,
      isOwner,
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        clinicName: isOwner ? "MedLum Platform" : doctor.clinicName,
        phone: doctor.phone,
        createdAt: doctor.createdAt.toISOString(),
        isOwner,
        primaryRole,
        staffCode: resolvedStaffCode,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e || "error");
    console.error("login error", message);
    if (/SESSION_SECRET/i.test(message)) {
      return NextResponse.json(
        {
          success: false,
          error: "Sign-in is temporarily unavailable due to session configuration. Contact MedLum support.",
        },
        { status: 503 }
      );
    }
    if (/P1001|P1017|P1000|Can't reach database|ECONNREFUSED|database|PrismaClient/i.test(message)) {
      return NextResponse.json(
        {
          success: false,
          error: "Sign-in is temporarily unavailable (database connectivity). Please try again shortly.",
        },
        { status: 503 }
      );
    }
    if (/Telegram|OTP|not linked/i.test(message)) {
      return NextResponse.json(
        {
          success: false,
          error: message.includes("not linked")
            ? "Telegram is not linked to this account. Link Telegram first."
            : "Unable to send verification code. Contact MedLum support if this continues.",
          requiresTelegramLink: message.includes("not linked"),
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
