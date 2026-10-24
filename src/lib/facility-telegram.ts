import { prisma } from "@/lib/db";
import { createHash, randomBytes } from "crypto";
import { decryptSecret } from "@/lib/secret-crypto";

const TELEGRAM_TIMEOUT_MS = 10_000;
const FACILITY_LINK_TTL_MS = 30 * 60 * 1000;

async function telegramRequest<T>(token: string, method: string, body: Record<string, unknown> = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as any;
    if (!response.ok || !payload?.ok) {
      throw new Error(String(payload?.description || `Telegram API HTTP ${response.status}`));
    }
    return payload.result as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendFacilityTelegramMessage(clinicId: string, text: string): Promise<{ sent: boolean; reason?: string }> {
  const integration = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId },
    select: { encryptedToken: true, chatId: true, enabled: true, status: true },
  });
  if (!integration?.enabled || integration.status === "DISABLED") return { sent: false, reason: "FACILITY_TELEGRAM_NOT_CONNECTED" };
  if (!integration.chatId) return { sent: false, reason: "FACILITY_TELEGRAM_CHAT_MISSING" };

  try {
    const token = decryptSecret(integration.encryptedToken);
    await telegramRequest(token, "sendMessage", { chat_id: integration.chatId, text });
    await prisma.facilityTelegramIntegration.update({
      where: { clinicId },
      data: { status: "CONNECTED", lastVerifiedAt: new Date() },
    });
    return { sent: true };
  } catch (error) {
    console.error("[MedLum Facility Telegram] send failed", {
      clinicId,
      message: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    await prisma.facilityTelegramIntegration.update({
      where: { clinicId },
      data: { status: "ERROR" },
    }).catch(() => undefined);
    return { sent: false, reason: "FACILITY_TELEGRAM_SEND_FAILED" };
  }
}

export async function createFacilityTelegramConnection(clinicId: string): Promise<{ botUsername: string; deepLink: string; expiresAt: Date }> {
  const integration = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId },
    select: { botUsername: true, encryptedToken: true, enabled: true },
  });
  if (!integration || !integration.enabled) throw new Error("FACILITY_TELEGRAM_NOT_CONFIGURED");
  let botUsername = integration.botUsername;
  if (!botUsername) {
    const token = decryptSecret(integration.encryptedToken);
    const me = await telegramRequest<{ username?: string }>(token, "getMe");
    if (!me?.username) throw new Error("FACILITY_TELEGRAM_BOT_INVALID");
    botUsername = me.username;
  }
  const code = randomBytes(24).toString("base64url");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + FACILITY_LINK_TTL_MS);
  await prisma.facilityTelegramIntegration.update({
    where: { clinicId },
    data: {
      botUsername,
      chatId: "",
      status: "PENDING",
      connectionCodeHash: codeHash,
      connectionExpiresAt: expiresAt,
    },
  });
  return { botUsername, deepLink: `https://t.me/${botUsername}?start=${encodeURIComponent(code)}`, expiresAt };
}

export async function verifyFacilityTelegram(clinicId: string): Promise<{ username: string }> {
  const integration = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId },
    select: { encryptedToken: true },
  });
  if (!integration) throw new Error("FACILITY_TELEGRAM_NOT_CONFIGURED");
  const token = decryptSecret(integration.encryptedToken);
  const me = await telegramRequest<{ username?: string }>(token, "getMe");
  if (!me?.username) throw new Error("FACILITY_TELEGRAM_BOT_INVALID");
  await prisma.facilityTelegramIntegration.update({
    where: { clinicId },
    data: { botUsername: me.username, status: "CONNECTED", lastVerifiedAt: new Date() },
  });
  return { username: me.username };
}


export type FacilityTelegramStartValidation = {
  valid: boolean;
  reason: "valid" | "not_start" | "missing_payload" | "missing_pending_code" | "expired" | "code_mismatch";
  payload: string;
};

/** Parse Telegram deep-link payloads including /start@BotName payload forms. */
export function parseFacilityTelegramStartCommand(text: string): { isStart: boolean; payload: string } {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return { isStart: false, payload: "" };
  return { isStart: true, payload: String(match[1] || "").trim() };
}

/** Pure validation helper shared by the webhook and deterministic tests. */
export function validateFacilityTelegramStartPayload(
  text: string,
  expectedHash: string | null | undefined,
  expiresAt: Date | null | undefined,
  nowMs = Date.now(),
): FacilityTelegramStartValidation {
  const parsed = parseFacilityTelegramStartCommand(text);
  if (!parsed.isStart) return { valid: false, reason: "not_start", payload: "" };
  if (!parsed.payload) return { valid: false, reason: "missing_payload", payload: "" };
  if (!expectedHash) return { valid: false, reason: "missing_pending_code", payload: parsed.payload };
  if (!expiresAt || expiresAt.getTime() <= nowMs) return { valid: false, reason: "expired", payload: parsed.payload };
  const suppliedHash = createHash("sha256").update(parsed.payload).digest("hex");
  if (suppliedHash !== expectedHash) return { valid: false, reason: "code_mismatch", payload: parsed.payload };
  return { valid: true, reason: "valid", payload: parsed.payload };
}

/** Fetch Telegram's current webhook configuration without exposing bot tokens. */
export async function getFacilityTelegramWebhookDiagnostics(clinicId: string) {
  const integration = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId },
    select: { encryptedToken: true, enabled: true, botUsername: true, status: true, chatId: true, connectionExpiresAt: true },
  });
  if (!integration || !integration.enabled) throw new Error("FACILITY_TELEGRAM_NOT_CONFIGURED");
  const token = decryptSecret(integration.encryptedToken);
  const info = await telegramRequest<{
    url?: string;
    has_custom_certificate?: boolean;
    pending_update_count?: number;
    last_error_date?: number;
    last_error_message?: string;
    max_connections?: number;
    ip_address?: string;
  }>(token, "getWebhookInfo");
  const expectedUrl = facilityTelegramWebhookUrl(clinicId);
  return {
    status: integration.status,
    botUsername: integration.botUsername || null,
    connected: integration.status === "CONNECTED" && Boolean(integration.chatId),
    hasChat: Boolean(integration.chatId),
    connectionLinkExpired: Boolean(integration.connectionExpiresAt && integration.connectionExpiresAt.getTime() <= Date.now()),
    expectedWebhookUrl: expectedUrl,
    actualWebhookUrl: info.url || null,
    webhookUrlMatches: Boolean(info.url && info.url === expectedUrl),
    pendingUpdateCount: Number(info.pending_update_count || 0),
    lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
    lastErrorMessage: info.last_error_message || null,
    maxConnections: info.max_connections ?? null,
    telegramIpAddress: info.ip_address || null,
  };
}

export function facilityTelegramWebhookUrl(clinicId: string): string {
  const origin = String(
    process.env.MEDLUM_APP_URL || process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_ENV === "production" ? "https://medlum-mvp.vercel.app" : "")
  ).trim().replace(/\/$/, "");
  return `${origin || "http://localhost:3000"}/api/telegram/facility/${encodeURIComponent(clinicId)}`;
}

export async function ensureFacilityTelegramWebhook(clinicId: string): Promise<void> {
  const integration = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId },
    select: { encryptedToken: true },
  });
  if (!integration) throw new Error("FACILITY_TELEGRAM_NOT_CONFIGURED");
  const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET_MISSING");
  const token = decryptSecret(integration.encryptedToken);
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET_INVALID_FORMAT");
  }
  const expectedUrl = facilityTelegramWebhookUrl(clinicId);
  await telegramRequest(token, "setWebhook", {
    url: expectedUrl,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  const current = await telegramRequest<{ url?: string }>(token, "getWebhookInfo");
  if (current.url !== expectedUrl) throw new Error("TELEGRAM_WEBHOOK_URL_MISMATCH");
}
