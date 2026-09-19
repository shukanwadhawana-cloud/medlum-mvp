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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password required" }, { status: 400 });
    }

    const rl = await consumeRateLimit(
      authBucketKey("login", req, email),
      AUTH_LIMITS.login.limit,
      AUTH_LIMITS.login.windowMs
    );
    if (!rl.allowed) {
      const { body: b, headers } = rateLimitResponse(rl.retryAfterSec);
      return NextResponse.json(b, { status: 429, headers });
    }

    const doctor = await prisma.doctor.findUnique({ where: { email } });
    if (!doctor || !(await verifyPassword(password, doctor.passwordHash))) {
      await writeAudit({
        doctorId: doctor?.id,
        action: "login_failed",
        entity: "Doctor",
        entityId: doctor?.id,
        meta: { email },
      });
      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }

    if (!doctor.isActive) {
      return NextResponse.json(
        { success: false, error: "This account is deactivated. Contact MedLum support." },
        { status: 403 }
      );
    }

    const isOwner = isMedlumOwnerEmail(doctor.email);

    if (!isOwner) {
      await ensurePrimaryClinic(doctor.id, doctor.clinicName);
    }

    const membership = await prisma.clinicMember.findFirst({
      where: { doctorId: doctor.id, isActive: true },
      select: { role: true, clinicId: true },
      orderBy: { createdAt: "asc" },
    });
    const primaryRole = isOwner ? "Owner" : normalizeClinicRole(membership?.role);

    // Privileged roles (Owner/Admin/Manager/MasterOwner), including platform owner emails,
    // MUST complete OTP before any authenticated session is created.
    if (roleRequiresOtp(primaryRole)) {
      try {
        const issued = await issueLoginOtp({
          doctorId: doctor.id,
          email: doctor.email,
          clinicId: membership?.clinicId,
        });
        return NextResponse.json({
          success: true,
          requiresOtp: true,
          challengeId: issued.challengeId,
          expiresAt: issued.expiresAt.toISOString(),
          deliveryChannel: issued.delivery.channel,
          // devOtp is only present when NODE_ENV !== production (issueLoginOtp strips it otherwise)
          ...(issued.delivery.devCode ? { devOtp: issued.delivery.devCode } : {}),
          doctor: {
            id: doctor.id,
            name: doctor.name,
            email: doctor.email,
            primaryRole,
          },
        });
      } catch (otpErr) {
        console.error("login otp issue failed", otpErr instanceof Error ? otpErr.message : "error");
        return NextResponse.json(
          {
            success: false,
            error: "Unable to send verification code. Contact MedLum support if this continues.",
          },
          { status: 503 }
        );
      }
    }

    // Non-OTP roles only: session may be created after password validation.
    await createSession({ doctorId: doctor.id, email: doctor.email });
    await writeAudit({
      doctorId: doctor.id,
      action: "login",
      entity: isOwner ? "PlatformOwner" : "Doctor",
      entityId: doctor.id,
      meta: { isOwner, primaryRole },
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
      },
    });
  } catch (e) {
    console.error("login error", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
