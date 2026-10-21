import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findDoctorByStaffLoginId } from "@/lib/staff-id";
import { generateOtpCode, hashOtp, sendTelegramMessage } from "@/lib/otp";
import { AUTH_LIMITS, authBucketKey, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const GENERIC_MESSAGE =
  "If this account is eligible for self-service recovery, a code has been sent to its linked Telegram account. If Telegram is not linked or unavailable, contact your clinic administrator for a secure reset link.";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identifier || body.staffId || body.email || "").trim();
    if (!identifier || identifier.length > 254) {
      return NextResponse.json({ success: false, error: "Enter your MedLum Staff ID or account email." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const limit = await consumeRateLimit(
      authBucketKey("password-reset-request", req, identifier),
      AUTH_LIMITS.portalReset.limit,
      AUTH_LIMITS.portalReset.windowMs,
    );
    if (!limit.allowed) {
      const { body: responseBody, headers } = rateLimitResponse(limit.retryAfterSec);
      return NextResponse.json(responseBody, { status: 429, headers: { ...headers, "Cache-Control": "no-store" } });
    }

    let doctor: { id: string; email: string; isActive: boolean } | null = null;
    let clinicId: string | null = null;
    if (identifier.includes("@")) {
      const byEmail = await prisma.doctor.findUnique({
        where: { email: identifier.toLowerCase() },
        select: { id: true, email: true, isActive: true },
      });
      doctor = byEmail;
      if (doctor) {
        const member = await prisma.clinicMember.findFirst({
          where: { doctorId: doctor.id, isActive: true },
          select: { clinicId: true },
          orderBy: { createdAt: "asc" },
        });
        clinicId = member?.clinicId || null;
      }
    } else {
      const resolved = await findDoctorByStaffLoginId(identifier);
      if (resolved) {
        doctor = { id: resolved.doctor.id, email: resolved.doctor.email, isActive: resolved.doctor.isActive };
        clinicId = resolved.membership?.clinicId || null;
      }
    }

    // Always return the same public response for unknown, inactive, unlinked, and eligible accounts.
    if (doctor?.isActive) {
      const telegram = await prisma.telegramIdentity.findUnique({
        where: { doctorId: doctor.id },
        select: { telegramChatId: true },
      });
      if (telegram?.telegramChatId) {
        const code = generateOtpCode();
        const now = new Date();
        await prisma.otpChallenge.updateMany({
          where: { doctorId: doctor.id, purpose: "password_reset", consumedAt: null },
          data: { consumedAt: now },
        });
        const challenge = await prisma.otpChallenge.create({
          data: {
            doctorId: doctor.id,
            clinicId,
            purpose: "password_reset",
            codeHash: await hashOtp(code),
            expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
            maxAttempts: 5,
            deliveryChannel: "telegram",
          },
        });
        try {
          await sendTelegramMessage(
            telegram.telegramChatId,
            `MedLum password reset code: ${code}\n\nThis code expires in 10 minutes and can be used once. If you did not request this, ignore this message.`,
          );
          await writeAudit({
            doctorId: doctor.id,
            action: "PASSWORD_RESET_REQUESTED",
            entity: "OtpChallenge",
            entityId: challenge.id,
            clinicId,
            meta: { channel: "telegram" },
          });
        } catch (deliveryError) {
          await prisma.otpChallenge.updateMany({
            where: { id: challenge.id, consumedAt: null },
            data: { consumedAt: new Date() },
          }).catch(() => undefined);
          console.error("password reset delivery failed", deliveryError instanceof Error ? deliveryError.message : "unknown");
        }
      }
    }

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("password reset request failed", error instanceof Error ? error.message : "unknown");
    // Keep responses non-enumerating even for recoverable service failures.
    return NextResponse.json({ success: true, message: GENERIC_MESSAGE }, { headers: { "Cache-Control": "no-store" } });
  }
}
