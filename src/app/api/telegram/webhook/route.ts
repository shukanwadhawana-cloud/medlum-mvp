import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/otp";

export const runtime = "nodejs";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || "");
  const supplied = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!expected || supplied !== expected) return NextResponse.json({ ok: false }, { status: 401 });

  const update = await req.json().catch(() => null) as any;
  const message = update?.message;
  const from = message?.from;
  const chat = message?.chat;
  const text = String(message?.text || "");
  if (!from?.id || !chat?.id || !text.startsWith("/start")) return NextResponse.json({ ok: true });

  const token = text.slice(6).trim();
  if (!token) {
    await sendTelegramMessage(String(chat.id), "MedLum: please use the Telegram link generated inside your MedLum account.");
    return NextResponse.json({ ok: true });
  }

  const challenge = await prisma.telegramLinkChallenge.findFirst({
    where: { tokenHash: hashToken(token), consumedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!challenge) {
    await sendTelegramMessage(String(chat.id), "This MedLum linking link is invalid or expired. Generate a new one from MedLum.");
    return NextResponse.json({ ok: true });
  }

  const existing = await prisma.telegramIdentity.findFirst({
    where: { OR: [{ doctorId: challenge.doctorId }, { telegramUserId: String(from.id) }, { telegramChatId: String(chat.id) }] },
  });

  if (existing && existing.doctorId !== challenge.doctorId) {
    return NextResponse.json({ ok: true });
  }

  await prisma.$transaction([
    prisma.telegramIdentity.upsert({
      where: { doctorId: challenge.doctorId },
      create: {
        doctorId: challenge.doctorId,
        telegramUserId: String(from.id),
        telegramChatId: String(chat.id),
        telegramUsername: from.username ? String(from.username) : null,
      },
      update: {
        telegramUserId: String(from.id),
        telegramChatId: String(chat.id),
        telegramUsername: from.username ? String(from.username) : null,
      },
    }),
    prisma.telegramLinkChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    }),
  ]);

  await sendTelegramMessage(String(chat.id), "MedLum Telegram is now linked to your account. Future privileged login verification codes will be sent here.");
  return NextResponse.json({ ok: true });
}
