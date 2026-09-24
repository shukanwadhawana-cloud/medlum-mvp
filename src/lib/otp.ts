import { createHash, randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { sendFacilityTelegramMessage } from "@/lib/facility-telegram";

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_LENGTH = 6;
const TELEGRAM_TIMEOUT_MS = 10_000;

export type OtpDeliveryResult = { channel: "console" | "telegram"; devCode?: string };

export function generateOtpCode(): string { return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0"); }
export async function hashOtp(code: string): Promise<string> { return bcrypt.hash(code, 10); }
export async function verifyOtpHash(code: string, hash: string): Promise<boolean> { return bcrypt.compare(code, hash); }
export const OTP_REQUIRED_ROLES = new Set(["Owner", "Admin", "Manager", "MasterOwner"]);
export function roleRequiresOtp(role: string | null | undefined): boolean { return !!role && OTP_REQUIRED_ROLES.has(role); }
function hashLinkToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }

function telegramBotConfig() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const username = String(process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
  return { token, username };
}

async function telegramRequest<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const { token } = telegramBotConfig();
  if (!token) throw new Error("Telegram OTP delivery is not configured.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal, cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as any;
    if (!response.ok || !payload?.ok) throw new Error(String(payload?.description || `Telegram API HTTP ${response.status}`));
    return payload.result as T;
  } finally { clearTimeout(timer); }
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> { await telegramRequest("sendMessage", { chat_id: chatId, text }); }

/** Explicit deployment origin. On Render this MUST be MEDLUM_APP_URL=https://medlum-mvp.onrender.com. */
export function getCanonicalAppOrigin(): string {
  const explicit = String(process.env.MEDLUM_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").trim().replace(/\/$/, "");
  if (explicit.startsWith("http://") || explicit.startsWith("https://")) return explicit;
  if (process.env.NODE_ENV === "production") return "";
  const vercelUrl = String(process.env.VERCEL_URL || "").trim().replace(/\/$/, "");
  if (vercelUrl) return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  return "http://localhost:3000";
}
export function getTelegramWebhookUrl(): string { return `${getCanonicalAppOrigin()}/api/telegram/webhook`; }

export type TelegramConfigStatus = { tokenConfigured: boolean; usernameConfigured: boolean; secretConfigured: boolean; webhookUrl: string };
export function getTelegramConfigStatus(): TelegramConfigStatus {
  const { token, username } = telegramBotConfig();
  return { tokenConfigured: !!token, usernameConfigured: !!username, secretConfigured: !!String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim(), webhookUrl: getTelegramWebhookUrl() };
}

/** Validate credentials and force the bot webhook to this deployment's explicitly configured public origin. */
export async function ensureTelegramWebhook(): Promise<{ webhookUrl: string; botUsername: string | null }> {
  const cfg = getTelegramConfigStatus();
  if (!cfg.tokenConfigured) { const e: any = new Error("CONFIG_MISSING: TELEGRAM_BOT_TOKEN"); e.code = "CONFIG_MISSING"; throw e; }
  if (!cfg.secretConfigured) { const e: any = new Error("CONFIG_MISSING: TELEGRAM_WEBHOOK_SECRET"); e.code = "CONFIG_MISSING"; throw e; }
  try { await telegramRequest("getMe"); }
  catch (e: any) { const msg = String(e?.message || e); const err: any = new Error(/unauthorized|401/i.test(msg) ? "BOT_TOKEN_INVALID" : "TELEGRAM_API_UNREACHABLE"); err.code = err.message; throw err; }
  try {
    await telegramRequest("setWebhook", { url: cfg.webhookUrl, secret_token: String(process.env.TELEGRAM_WEBHOOK_SECRET).trim(), allowed_updates: ["message"], drop_pending_updates: false });
    const info = await telegramRequest<{ url?: string }>("getWebhookInfo");
    const registered = String(info?.url || "");
    if (registered !== cfg.webhookUrl) { const e: any = new Error("WEBHOOK_VERIFY_FAILED"); e.code = "WEBHOOK_VERIFY_FAILED"; throw e; }
  } catch (e: any) {
    if (e?.code === "WEBHOOK_VERIFY_FAILED") throw e;
    const err: any = new Error("WEBHOOK_SET_FAILED"); err.code = err.message; throw err;
  }
  const { username } = telegramBotConfig();
  return { webhookUrl: cfg.webhookUrl, botUsername: username || null };
}

export function classifyTelegramError(error: unknown): string {
  if (!error) return "TELEGRAM_UNKNOWN";
  const code = (error as any)?.code; if (typeof code === "string" && code) return code;
  const msg = String((error as any)?.message || error);
  if (msg.includes("CONFIG_MISSING")) return "CONFIG_MISSING";
  if (msg.includes("BOT_TOKEN_INVALID") || /unauthorized/i.test(msg)) return "BOT_TOKEN_INVALID";
  if (msg.includes("WEBHOOK_VERIFY_FAILED")) return "WEBHOOK_VERIFY_FAILED";
  if (msg.includes("WEBHOOK_SET_FAILED")) return "WEBHOOK_SET_FAILED";
  if (/timeout|abort|fetch failed|ENOTFOUND|ECONN/i.test(msg)) return "TELEGRAM_API_UNREACHABLE";
  return "TELEGRAM_UNKNOWN";
}

export async function createTelegramLinkChallenge(doctorId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(24).toString("base64url"); const tokenHash = hashLinkToken(token); const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.telegramLinkChallenge.updateMany({ where: { doctorId, consumedAt: null }, data: { consumedAt: new Date() } });
  await prisma.telegramLinkChallenge.create({ data: { doctorId, tokenHash, expiresAt } });
  return { token, expiresAt };
}

export async function issueLoginOtp(params: { doctorId: string; clinicId?: string | null }): Promise<{ challengeId: string; delivery: OtpDeliveryResult; expiresAt: Date }> {
  await prisma.otpChallenge.updateMany({ where: { doctorId: params.doctorId, purpose: "login", consumedAt: null }, data: { consumedAt: new Date() } });
  const identity = await prisma.telegramIdentity.findUnique({ where: { doctorId: params.doctorId }, select: { telegramChatId: true } });
  const code = generateOtpCode(); const codeHash = await hashOtp(code); const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const challenge = await prisma.otpChallenge.create({ data: { doctorId: params.doctorId, clinicId: params.clinicId || null, purpose: "login", codeHash, expiresAt, deliveryChannel: "telegram" } });
  let delivery: OtpDeliveryResult;
  try {
    let facilitySent = false;
    if (params.clinicId) facilitySent = (await sendFacilityTelegramMessage(params.clinicId, `MedLum login verification code\n\nYour verification code is: ${code}\n\nThis code expires in 5 minutes.`)).sent;
    if (facilitySent) delivery = { channel: "telegram" };
    else if (identity?.telegramChatId) { await sendTelegramMessage(identity.telegramChatId, `MedLum login verification code\n\nYour verification code is: ${code}\n\nThis code expires in 5 minutes.`); delivery = { channel: "telegram" }; }
    else if (process.env.NODE_ENV !== "production") delivery = { channel: "console", devCode: code };
    else throw new Error("Telegram account is not linked. Link Telegram before signing in.");
  } catch (err) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date(), deliveryChannel: "telegram" } });
    if (process.env.NODE_ENV !== "production" && !identity?.telegramChatId) return { challengeId: challenge.id, delivery: { channel: "console", devCode: code }, expiresAt };
    throw err;
  }
  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { deliveryChannel: delivery.channel } });
  await writeAudit({ doctorId: params.doctorId, action: "otp_issued", entity: "OtpChallenge", entityId: challenge.id, meta: { channel: delivery.channel, purpose: "login" }, clinicId: params.clinicId });
  return { challengeId: challenge.id, delivery: { channel: delivery.channel, ...(process.env.NODE_ENV !== "production" && delivery.devCode ? { devCode: delivery.devCode } : {}) }, expiresAt };
}

export async function consumeLoginOtp(params: { doctorId: string; challengeId: string; code: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const challenge = await prisma.otpChallenge.findFirst({ where: { id: params.challengeId, doctorId: params.doctorId, purpose: "login" } });
  if (!challenge) return { ok: false, error: "Invalid or expired verification code." };
  if (challenge.consumedAt) return { ok: false, error: "This verification code was already used." };
  if (challenge.expiresAt.getTime() < Date.now()) return { ok: false, error: "Verification code expired. Sign in again." };
  if (challenge.attempts >= challenge.maxAttempts) return { ok: false, error: "Too many verification attempts. Sign in again." };
  if (!(await verifyOtpHash(params.code.trim(), challenge.codeHash))) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    await writeAudit({ doctorId: params.doctorId, action: "otp_failed", entity: "OtpChallenge", entityId: challenge.id });
    return { ok: false, error: "Invalid verification code." };
  }
  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  await writeAudit({ doctorId: params.doctorId, action: "otp_verified", entity: "OtpChallenge", entityId: challenge.id });
  return { ok: true };
}
