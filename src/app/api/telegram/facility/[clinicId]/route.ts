import { NextResponse } from "next/server";
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

export async function POST(req: Request, { params }: { params: { clinicId: string } }) {
  const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const supplied = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!expected || supplied !== expected) return NextResponse.json({ ok: false }, { status: 401 });

  const integration = await prisma.facilityTelegramIntegration.findUnique({
    where: { clinicId: params.clinicId },
    select: { encryptedToken: true, chatId: true, enabled: true, status: true },
  });
  if (!integration || !integration.enabled || integration.status !== "CONNECTED") {
    return NextResponse.json({ ok: true });
  }

  const update = (await req.json().catch(() => null)) as any;
  const message = update?.message;
  const chatId = String(message?.chat?.id || "");
  const command = String(message?.text || "").trim();

  // Never let an arbitrary Telegram chat replace the configured facility destination.
  if (!chatId || chatId !== integration.chatId) return NextResponse.json({ ok: true });

  if (command === "/start") {
    try {
      await send(decryptSecret(integration.encryptedToken), chatId, "MedLum facility Telegram is connected and ready for notifications.");
    } catch {
      await prisma.facilityTelegramIntegration.update({
        where: { clinicId: params.clinicId },
        data: { status: "ERROR" },
      }).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true });
}
