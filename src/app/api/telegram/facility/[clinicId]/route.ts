import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-crypto";

export const runtime = "nodejs";

async function send(token: string, chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as any;
  if (!response.ok || !payload?.ok) throw new Error(String(payload?.description || "Telegram send failed"));
}

export async function POST(req: Request, {
  const { clinicId } = await params; params }: { params: Promise<{ clinicId: string }> }) {
  const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const supplied = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!expected || supplied !== expected) return NextResponse.json({ ok: false }, { status: 401 });

  const integration = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId: clinicId },
    select: { encryptedToken: true, chatId: true, enabled: true, status: true, connectionCodeHash: true, connectionExpiresAt: true },
  });
  if (!integration || !integration.enabled || integration.status === "DISABLED") {
    return NextResponse.json({ ok: true });
  }

  const update = (await req.json().catch(() => null)) as any;
  const message = update?.message;
  const chatId = String(message?.chat?.id || "");
  const command = String(message?.text || "").trim();

  if (!chatId) return NextResponse.json({ ok: true });

  // First connection: only a fresh, one-time deep-link code can claim the facility bot.
  if (!integration.chatId && integration.status === "PENDING" && command.startsWith("/start")) {
    const suppliedCode = command.slice("/start".length).trim();
    const expectedHash = integration.connectionCodeHash || "";
    const expiresAt = integration.connectionExpiresAt;
    const suppliedHash = suppliedCode ? createHash("sha256").update(suppliedCode).digest("hex") : "";
    const valid = Boolean(
      suppliedCode &&
      expectedHash &&
      expiresAt &&
      expiresAt.getTime() > Date.now() &&
      suppliedHash === expectedHash
    );
    if (!valid) return NextResponse.json({ ok: true });

    await prisma.facilityTelegramIntegration.update({
      where: { clinicId: clinicId },
      data: {
        chatId,
        status: "CONNECTED",
        connectionCodeHash: null,
        connectionExpiresAt: null,
        lastVerifiedAt: new Date(),
      },
    });

    try {
      await send(
        decryptSecret(integration.encryptedToken),
        chatId,
        "MedLum facility Telegram is now connected. This chat will receive facility notifications."
      );
    } catch {
      await prisma.facilityTelegramIntegration.update({
        where: { clinicId: clinicId },
        data: { status: "ERROR" },
      }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  }

  // Once connected, never let an arbitrary Telegram chat replace the configured destination.
  if (!integration.chatId || chatId !== integration.chatId) return NextResponse.json({ ok: true });

  if (command === "/start") {
    try {
      await send(decryptSecret(integration.encryptedToken), chatId, "MedLum facility Telegram is connected and ready for notifications.");
    } catch {
      await prisma.facilityTelegramIntegration.update({
        where: { clinicId: clinicId },
        data: { status: "ERROR" },
      }).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true });
}
