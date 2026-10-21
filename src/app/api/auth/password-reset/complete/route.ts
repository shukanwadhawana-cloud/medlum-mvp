import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { verifyOtpHash } from "@/lib/otp";
import { findDoctorByStaffLoginId } from "@/lib/staff-id";
import { AUTH_LIMITS, authBucketKey, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

function invalidReset() {
  return NextResponse.json(
    { success: false, error: "The reset code or link is invalid, expired, or already used." },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

async function resolveDoctor(identifier: string) {
  if (identifier.includes("@")) {
    return prisma.doctor.findUnique({ where: { email: identifier.toLowerCase() }, select: { id: true, isActive: true, email: true } });
  }
  const resolved = await findDoctorByStaffLoginId(identifier);
  return resolved?.doctor ? { id: resolved.doctor.id, isActive: resolved.doctor.isActive, email: resolved.doctor.email } : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");
    const token = String(body.token || "");
    const identifier = String(body.identifier || body.staffId || body.email || "").trim();
    const code = String(body.code || "").trim();

    if (newPassword.length < 12 || newPassword.length > 128) {
      return NextResponse.json({ success: false, error: "Use a password between 12 and 128 characters." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (confirmPassword !== newPassword) {
      return NextResponse.json({ success: false, error: "The passwords do not match." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const limit = await consumeRateLimit(
      authBucketKey("password-reset-complete", req, token ? "reset-link" : identifier),
      AUTH_LIMITS.portalReset.limit,
      AUTH_LIMITS.portalReset.windowMs,
    );
    if (!limit.allowed) {
      const { body: responseBody, headers } = rateLimitResponse(limit.retryAfterSec);
      return NextResponse.json(responseBody, { status: 429, headers: { ...headers, "Cache-Control": "no-store" } });
    }

    let challenge: { id: string; doctorId: string; purpose: string; codeHash: string; attempts: number; maxAttempts: number } | null = null;
    let channel = "";
    if (token) {
      if (token.length < 40 || token.length > 200) return invalidReset();
      const tokenHash = createHash("sha256").update(token).digest("hex");
      challenge = await prisma.otpChallenge.findFirst({
        where: { purpose: "password_reset_link", codeHash: tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, doctorId: true, purpose: true, codeHash: true, attempts: true, maxAttempts: true },
      });
      channel = "admin_reset_link";
    } else {
      if (!identifier || !code || !/^\d{6}$/.test(code)) return invalidReset();
      const doctor = await resolveDoctor(identifier);
      if (!doctor?.isActive) return invalidReset();
      challenge = await prisma.otpChallenge.findFirst({
        where: {
          doctorId: doctor.id,
          purpose: "password_reset",
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: 5 },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, doctorId: true, purpose: true, codeHash: true, attempts: true, maxAttempts: true },
      });
      if (!challenge || !(await verifyOtpHash(code, challenge.codeHash))) {
        if (challenge) {
          await prisma.otpChallenge.updateMany({
            where: { id: challenge.id, consumedAt: null, attempts: { lt: challenge.maxAttempts } },
            data: { attempts: { increment: 1 } },
          });
        }
        return invalidReset();
      }
      channel = "telegram_otp";
    }

    if (!challenge || challenge.attempts >= challenge.maxAttempts) return invalidReset();
    const doctor = await prisma.doctor.findUnique({
      where: { id: challenge.doctorId },
      select: { id: true, isActive: true, email: true },
    });
    if (!doctor?.isActive) return invalidReset();

    const now = new Date();
    const passwordHash = await hashPassword(newPassword);
    try {
      await prisma.$transaction(async (tx) => {
        const consumed = await tx.otpChallenge.updateMany({
          where: { id: challenge!.id, doctorId: doctor.id, purpose: challenge!.purpose, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: challenge!.maxAttempts } },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) throw new Error("RESET_CHALLENGE_ALREADY_USED");
        await tx.doctor.update({
          where: { id: doctor.id },
          data: { passwordHash, sessionInvalidatedAt: now },
        });
        await tx.otpChallenge.updateMany({
          where: { doctorId: doctor.id, purpose: { in: ["password_reset", "password_reset_link"] }, consumedAt: null },
          data: { consumedAt: now },
        });
      });
    } catch {
      return invalidReset();
    }

    await writeAudit({
      doctorId: doctor.id,
      action: "PASSWORD_RESET_COMPLETED",
      entity: "Doctor",
      entityId: doctor.id,
      meta: { method: channel, sessionsInvalidated: true },
    });
    return NextResponse.json({ success: true, message: "Password updated. Sign in again with your new password." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("password reset completion failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ success: false, error: "Unable to reset password right now. Please try again later." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
