/**
 * Provider-agnostic OTP for privileged hospital logins.
 * Delivery adapters: console (dev/free), email (when SMTP configured).
 * OTP plaintext is never logged and only hashed in DB.
 */
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_LENGTH = 6;

export type OtpDeliveryResult = {
  channel: "console" | "email" | "telegram";
  /** Only present in non-production for local/dev testing — never set when NODE_ENV=production */
  devCode?: string;
};

export function generateOtpCode(): string {
  const max = 10 ** OTP_LENGTH;
  const n = randomInt(0, max);
  return String(n).padStart(OTP_LENGTH, "0");
}

export async function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function verifyOtpHash(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

/** Roles that require OTP after password (privileged). */
export const OTP_REQUIRED_ROLES = new Set([
  "Owner",
  "Admin",
  "Manager",
  "MasterOwner",
]);

export function roleRequiresOtp(role: string | null | undefined): boolean {
  if (!role) return false;
  return OTP_REQUIRED_ROLES.has(role);
}

async function deliverOtp(params: {
  doctorId: string;
  email: string;
  code: string;
}): Promise<OtpDeliveryResult> {
  const gmailUser = process.env.GMAIL_SMTP_USER || "";
  const gmailAppPassword = process.env.GMAIL_SMTP_APP_PASSWORD || "";
  const from = process.env.GMAIL_SMTP_FROM || gmailUser;

  // Gmail SMTP is the production delivery provider.
  if (gmailUser && gmailAppPassword) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailAppPassword },
      });

      await transporter.sendMail({
        from,
        to: params.email,
        subject: "MedLum login verification code",
        text: `Your MedLum verification code is ${params.code}. It expires in 5 minutes. If you did not request this code, ignore this email.`,
        html: `<p>Your MedLum verification code is <strong>${params.code}</strong>.</p><p>It expires in 5 minutes.</p><p>If you did not request this code, you can ignore this email.</p>`,
      });
      return { channel: "email" };
    } catch (error) {
      console.error("[MedLum OTP] Gmail delivery failed:", error instanceof Error ? error.message : "unknown error");
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(`[MedLum OTP] doctor=${params.doctorId} code issued (dev only)`);
    return { channel: "console", devCode: params.code };
  }

  throw new Error("Gmail OTP delivery is not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD.");
}

export async function issueLoginOtp(params: {
  doctorId: string;
  email: string;
  clinicId?: string | null;
}): Promise<{ challengeId: string; delivery: OtpDeliveryResult; expiresAt: Date }> {
  await prisma.otpChallenge.updateMany({
    where: { doctorId: params.doctorId, purpose: "login", consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateOtpCode();
  const codeHash = await hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const challenge = await prisma.otpChallenge.create({
    data: {
      doctorId: params.doctorId,
      clinicId: params.clinicId || null,
      purpose: "login",
      codeHash,
      expiresAt,
      deliveryChannel: "console",
    },
  });

  const delivery = await deliverOtp({
    doctorId: params.doctorId,
    email: params.email,
    code,
  });

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { deliveryChannel: delivery.channel },
  });

  await writeAudit({
    doctorId: params.doctorId,
    action: "otp_issued",
    entity: "OtpChallenge",
    entityId: challenge.id,
    meta: { channel: delivery.channel, purpose: "login" },
  });

  return {
    challengeId: challenge.id,
    delivery: {
      channel: delivery.channel,
      ...(process.env.NODE_ENV !== "production" && delivery.devCode
        ? { devCode: delivery.devCode }
        : {}),
    },
    expiresAt,
  };
}

export async function consumeLoginOtp(params: {
  doctorId: string;
  challengeId: string;
  code: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const challenge = await prisma.otpChallenge.findFirst({
    where: { id: params.challengeId, doctorId: params.doctorId, purpose: "login" },
  });

  if (!challenge) return { ok: false, error: "Invalid or expired verification code." };
  if (challenge.consumedAt) return { ok: false, error: "This verification code was already used." };
  if (challenge.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Verification code expired. Sign in again." };
  }
  if (challenge.attempts >= challenge.maxAttempts) {
    return { ok: false, error: "Too many verification attempts. Sign in again." };
  }

  const match = await verifyOtpHash(params.code.trim(), challenge.codeHash);
  if (!match) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    await writeAudit({
      doctorId: params.doctorId,
      action: "otp_failed",
      entity: "OtpChallenge",
      entityId: challenge.id,
    });
    return { ok: false, error: "Invalid verification code." };
  }

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  await writeAudit({
    doctorId: params.doctorId,
    action: "otp_verified",
    entity: "OtpChallenge",
    entityId: challenge.id,
  });

  return { ok: true };
}
