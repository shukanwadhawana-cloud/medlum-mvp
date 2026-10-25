import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-crypto";
import { parseFacilityTelegramStartCommand, validateFacilityTelegramStartPayload } from "@/lib/facility-telegram";

export const runtime = "nodejs";

async function send(token: string, chatId: string, text: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as any;
    if (!response.ok || !payload?.ok) throw new Error(String(payload?.description || `Telegram send failed (HTTP ${response.status})`));
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const { clinicId } = await params;
  const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const supplied = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!expected || supplied !== expected) return NextResponse.json({ ok: false }, { status: 401 });

  const integration = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId },
    select: { encryptedToken: true, chatId: true, enabled: true, status: true, connectionCodeHash: true, connectionExpiresAt: true },
  });
  if (!integration || !integration.enabled || integration.status === "DISABLED") {
    return NextResponse.json({ ok: true });
  }

  const update = (await req.json().catch(() => null)) as any;
  const message = update?.message;
  const chatId = String(message?.chat?.id || "");
  const command = String(message?.text || "").trim();
  const startCommand = parseFacilityTelegramStartCommand(command);

  if (!chatId) return NextResponse.json({ ok: true });

  console.info("[MedLum Facility Telegram] update received", {
    clinicId,
    updateId: Number.isFinite(Number(update?.update_id)) ? Number(update.update_id) : null,
    command: startCommand.isStart ? "start" : command.startsWith("/") ? "other_command" : "message",
    hasStartPayload: Boolean(startCommand.payload),
    status: integration.status,
    chatLinked: Boolean(integration.chatId),
    hasPendingCode: Boolean(integration.connectionCodeHash),
    linkExpired: Boolean(integration.connectionExpiresAt && integration.connectionExpiresAt.getTime() <= Date.now()),
  });

  if (!integration.chatId && integration.status === "PENDING" && startCommand.isStart) {
    const validation = validateFacilityTelegramStartPayload(
      command,
      integration.connectionCodeHash,
      integration.connectionExpiresAt,
    );
    if (!validation.valid) {
      console.warn("[MedLum Facility Telegram] connection handshake rejected", {
        clinicId,
        reason: validation.reason,
        status: integration.status,
        hasPendingCode: Boolean(integration.connectionCodeHash),
        linkExpired: Boolean(integration.connectionExpiresAt && integration.connectionExpiresAt.getTime() <= Date.now()),
      });
      try {
        let guidance = "This MedLum connection link could not be verified. Return to MedLum Owner → Hospitals, select this hospital, and generate a fresh Telegram link.";
        if (validation.reason === "missing_payload") {
          guidance = "You opened the bot without the one-time hospital link. Return to MedLum Owner → Hospitals, select this hospital, tap Connect Telegram, then open that exact generated link and press Start.";
        } else if (validation.reason === "expired") {
          guidance = "This MedLum hospital connection link has expired. Return to MedLum Owner → Hospitals, select this hospital, generate a fresh Telegram link, and press Start within 30 minutes.";
        } else if (validation.reason === "missing_pending_code") {
          guidance = "MedLum has no active connection code for this link. Generate a new Telegram connection link from MedLum Owner → Hospitals and press Start there.";
        } else if (validation.reason === "code_mismatch") {
          guidance = "This Telegram link does not match the current hospital connection request. Generate a fresh link in MedLum and use that exact link.";
        }
        await send(decryptSecret(integration.encryptedToken), chatId, guidance);
      } catch (error) {
        console.error("[MedLum Facility Telegram] could not reply to rejected start command", {
          clinicId,
          reason: error instanceof Error ? error.message.slice(0, 180) : "unknown",
        });
        return NextResponse.json({ ok: false, error: "reply_failed" }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }

    // Atomic compare-and-set: only one concurrent webhook can claim the pending code.
    const claimed = await prisma.facilityTelegramIntegration.updateMany({
      where: {
        clinicId,
        status: "PENDING",
        connectionCodeHash: integration.connectionCodeHash,
        chatId: "",
      },
      data: {
        chatId,
        status: "CONNECTED",
        connectionCodeHash: null,
        connectionExpiresAt: null,
        lastVerifiedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      console.warn("[MedLum Facility Telegram] handshake claim lost (duplicate or concurrent update)", {
        clinicId,
        claimed: claimed.count,
      });
      return NextResponse.json({ ok: true });
    }

    console.info("[MedLum Facility Telegram] handshake accepted", { clinicId });
    try {
      await send(
        decryptSecret(integration.encryptedToken),
        chatId,
        "MedLum facility Telegram is now connected. This chat will receive facility notifications."
      );
    } catch (error) {
      console.error("[MedLum Facility Telegram] handshake reply failed", {
        clinicId,
        reason: error instanceof Error ? error.message.slice(0, 180) : "unknown",
      });
      await prisma.facilityTelegramIntegration.update({
        where: { clinicId },
        data: { status: "ERROR" },
      }).catch(() => undefined);
      return NextResponse.json({ ok: false, error: "reply_failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!integration.chatId || chatId !== integration.chatId) return NextResponse.json({ ok: true });

  if (startCommand.isStart) {
    try {
      await send(decryptSecret(integration.encryptedToken), chatId, "MedLum facility Telegram is connected and ready for notifications.");
      await prisma.facilityTelegramIntegration.update({
        where: { clinicId },
        data: { status: "CONNECTED", lastVerifiedAt: new Date() },
      });
    } catch (error) {
      console.error("[MedLum Facility Telegram] connected /start reply failed", {
        clinicId,
        reason: error instanceof Error ? error.message.slice(0, 180) : "unknown",
      });
      await prisma.facilityTelegramIntegration.update({
        where: { clinicId },
        data: { status: "ERROR" },
      }).catch(() => undefined);
      return NextResponse.json({ ok: false, error: "reply_failed" }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true });
}
