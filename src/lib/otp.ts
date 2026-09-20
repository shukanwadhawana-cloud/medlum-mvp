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

/** Strip paste artifacts from Google App Passwords (spaces/quotes) without logging secrets. */
export function normalizeSmtpUser(raw: string | undefined | null): string {
  return String(raw || "").trim().toLowerCase();
}

/**
 * Google App Passwords are 16 chars; Google UI shows them as "xxxx xxxx xxxx xxxx".
 * Pasted values often include spaces or surrounding quotes — those cause 535 BadCredentials.
 */
export function normalizeSmtpAppPassword(raw: string | undefined | null): string {
  let p = String(raw || "").trim();
  if (
    (p.startsWith('"') && p.endsWith('"')) ||
    (p.startsWith("'") && p.endsWith("'"))
  ) {
    p = p.slice(1, -1).trim();
  }
  // Remove all whitespace (spaces, tabs, newlines) — App Passwords never contain spaces.
  return p.replace(/\s+/g, "");
}

export type SmtpConfigSanitized = {
  smtpUserConfigured: boolean;
  smtpUserLooksLikeEmail: boolean;
  smtpUserLength: number;
  smtpPasswordConfigured: boolean;
  smtpPasswordLength: number;
  smtpPasswordHasLeadingWhitespace: boolean;
  smtpPasswordHasTrailingWhitespace: boolean;
  smtpPasswordHasInternalWhitespace: boolean;
  smtpPasswordLooksQuoted: boolean;
  smtpFromConfigured: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  runtime: string;
  nodeEnv: string;
};

/** Secret-free snapshot of SMTP env as the app will use it (after normalization). */
export function getSmtpConfigSanitized(): SmtpConfigSanitized {
  const rawUser = process.env.GMAIL_SMTP_USER || "";
  const rawPass = process.env.GMAIL_SMTP_APP_PASSWORD || "";
  const user = normalizeSmtpUser(rawUser);
  const pass = normalizeSmtpAppPassword(rawPass);
  const host = (process.env.GMAIL_SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.GMAIL_SMTP_PORT || "587");
  const secure = process.env.GMAIL_SMTP_SECURE
    ? process.env.GMAIL_SMTP_SECURE === "true"
    : port === 465;
  const rawTrim = String(rawPass);
  return {
    smtpUserConfigured: Boolean(user),
    smtpUserLooksLikeEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user),
    smtpUserLength: user.length,
    smtpPasswordConfigured: Boolean(pass),
    smtpPasswordLength: pass.length,
    smtpPasswordHasLeadingWhitespace: Boolean(rawPass && rawPass !== rawPass.trimStart()),
    smtpPasswordHasTrailingWhitespace: Boolean(rawPass && rawPass !== rawPass.trimEnd()),
    smtpPasswordHasInternalWhitespace: /\s/.test(rawTrim.trim()),
    smtpPasswordLooksQuoted:
      (rawTrim.trim().startsWith('"') && rawTrim.trim().endsWith('"')) ||
      (rawTrim.trim().startsWith("'") && rawTrim.trim().endsWith("'")),
    smtpFromConfigured: Boolean(String(process.env.GMAIL_SMTP_FROM || "").trim()),
    smtpHost: host,
    smtpPort: Number.isFinite(port) ? port : 587,
    smtpSecure: secure,
    runtime: "nodejs",
    nodeEnv: process.env.NODE_ENV || "undefined",
  };
}

function buildTransportOptions(user: string, pass: string, port: number, secure: boolean, host: string) {
  return {
    host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: { user, pass },
  };
}

/**
 * Create transporter with the same config used for OTP delivery.
 * Prefers 587 STARTTLS (works more reliably on serverless platforms).
 */
export async function createOtpMailTransport() {
  const nodemailer = await import("nodemailer");
  const user = normalizeSmtpUser(process.env.GMAIL_SMTP_USER);
  const pass = normalizeSmtpAppPassword(process.env.GMAIL_SMTP_APP_PASSWORD);
  if (!user || !pass) {
    throw new Error("Gmail OTP delivery is not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD.");
  }
  const host = (process.env.GMAIL_SMTP_HOST || "smtp.gmail.com").trim();
  let port = Number(process.env.GMAIL_SMTP_PORT || "587");
  if (!Number.isFinite(port) || port <= 0) port = 587;
  const secure = process.env.GMAIL_SMTP_SECURE
    ? process.env.GMAIL_SMTP_SECURE === "true"
    : port === 465;

  return nodemailer.createTransport(buildTransportOptions(user, pass, port, secure, host));
}

/** Safe SMTP verify for diagnostics — never returns secrets. */
export async function verifyOtpSmtpTransport(): Promise<{
  ok: boolean;
  code: "SMTP_CONFIG_OK" | "SMTP_VERIFY_OK" | "SMTP_AUTH_FAILED" | "SMTP_CONNECTION_FAILED" | "SMTP_VERIFY_FAILED" | "SMTP_NOT_CONFIGURED";
  message: string;
  config: SmtpConfigSanitized;
}> {
  const config = getSmtpConfigSanitized();
  if (!config.smtpUserConfigured || !config.smtpPasswordConfigured) {
    return { ok: false, code: "SMTP_NOT_CONFIGURED", message: "SMTP credentials missing", config };
  }
  try {
    const transporter = await createOtpMailTransport();
    await transporter.verify();
    return { ok: true, code: "SMTP_VERIFY_OK", message: "SMTP transport verified", config };
  } catch (error: any) {
    const msg = String(error?.message || error || "unknown");
    const responseCode = error?.responseCode || error?.code;
    const lower = msg.toLowerCase();
    if (
      responseCode === 535 ||
      lower.includes("invalid login") ||
      lower.includes("badcredentials") ||
      lower.includes("username and password not accepted") ||
      lower.includes("authentication failed")
    ) {
      return {
        ok: false,
        code: "SMTP_AUTH_FAILED",
        message: `SMTP auth failed (${responseCode || "auth"}). Check App Password normalization and Gmail account SMTP access.`,
        config,
      };
    }
    if (
      lower.includes("timeout") ||
      lower.includes("econnrefused") ||
      lower.includes("enotfound") ||
      lower.includes("socket")
    ) {
      return { ok: false, code: "SMTP_CONNECTION_FAILED", message: `SMTP connection failed (${responseCode || "conn"})`, config };
    }
    return { ok: false, code: "SMTP_VERIFY_FAILED", message: `SMTP verify failed (${responseCode || "error"})`, config };
  }
}

async function deliverOtp(params: {
  doctorId: string;
  email: string;
  code: string;
}): Promise<OtpDeliveryResult> {
  const gmailUser = normalizeSmtpUser(process.env.GMAIL_SMTP_USER);
  const gmailAppPassword = normalizeSmtpAppPassword(process.env.GMAIL_SMTP_APP_PASSWORD);
  const fromRaw = String(process.env.GMAIL_SMTP_FROM || "").trim();
  const from = fromRaw || gmailUser;

  if (gmailUser && gmailAppPassword) {
    try {
      const transporter = await createOtpMailTransport();
      await transporter.sendMail({
        from: from.includes("<") ? from : `"MedLum" <${from}>`,
        to: params.email,
        subject: "MedLum login verification code",
        text: `Your MedLum verification code is ${params.code}. It expires in 5 minutes. If you did not request this code, ignore this email.`,
        html: `<p>Your MedLum verification code is <strong>${params.code}</strong>.</p><p>It expires in 5 minutes.</p><p>If you did not request this code, you can ignore this email.</p>`,
      });
      return { channel: "email" };
    } catch (error: any) {
      const responseCode = error?.responseCode || error?.code || "";
      console.error(
        "[MedLum OTP] Gmail delivery failed:",
        error instanceof Error ? error.message.replace(/pass(word)?[=:]\S+/gi, "pass=[redacted]") : "unknown error",
        responseCode ? `code=${responseCode}` : ""
      );
      if (process.env.NODE_ENV === "production") {
        throw new Error("Gmail OTP delivery failed. Login verification is unavailable.");
      }
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

  let delivery: OtpDeliveryResult;
  try {
    delivery = await deliverOtp({
      doctorId: params.doctorId,
      email: params.email,
      code,
    });
  } catch (err) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date(), deliveryChannel: "console" },
    });
    throw err;
  }

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
