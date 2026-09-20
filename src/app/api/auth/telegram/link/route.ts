import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createTelegramLinkChallenge, ensureTelegramWebhook, classifyTelegramError, roleRequiresOtp } from "@/lib/otp";
import { normalizeClinicRole } from "@/lib/workflow";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

async function requirePrivilegedSession() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 }) };

  const doctor = await prisma.doctor.findUnique({
    where: { id: session.doctorId },
    select: { id: true, email: true, isActive: true },
  });
  if (!doctor?.isActive) return { error: NextResponse.json({ success: false, error: "Account unavailable." }, { status: 403 }) };

  const membership = await prisma.clinicMember.findFirst({
    where: { doctorId: doctor.id, isActive: true },
    select: { role: true },
    orderBy: { createdAt: "asc" },
  });
  const isOwner = isMedlumOwnerEmail(doctor.email);
  if (!isOwner && !roleRequiresOtp(normalizeClinicRole(membership?.role))) {
    return { error: NextResponse.json({ success: false, error: "Telegram linking is restricted to privileged accounts." }, { status: 403 }) };
  }
  return { doctor, isOwner };
}

export async function GET() {
  const auth = await requirePrivilegedSession();
  if ("error" in auth && auth.error) return auth.error;
  const doctor = auth.doctor!;

  const identity = await prisma.telegramIdentity.findUnique({
    where: { doctorId: doctor.id },
    select: { telegramUsername: true, linkedAt: true },
  });

  return NextResponse.json({
    success: true,
    linked: Boolean(identity),
    telegramUsername: identity?.telegramUsername || null,
    linkedAt: identity?.linkedAt?.toISOString() || null,
  });
}

export async function POST() {
  const auth = await requirePrivilegedSession();
  if ("error" in auth && auth.error) return auth.error;
  const doctor = auth.doctor!;

  const username = String(process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
  if (!username) return NextResponse.json({ success: false, error: "Telegram bot is not configured.", reason: "CONFIG_MISSING" }, { status: 503 });

  try {
    await ensureTelegramWebhook();
  } catch (error) {
    const reason = classifyTelegramError(error);
    console.error("[MedLum Telegram] link webhook failed reason=", reason);
    return NextResponse.json({ success: false, error: "Telegram webhook could not be configured.", reason }, { status: 503 });
  }

  const { token, expiresAt } = await createTelegramLinkChallenge(doctor.id);
  await writeAudit({
    doctorId: doctor.id,
    action: "telegram_link_started",
    entity: "TelegramLinkChallenge",
    meta: {},
  });

  return NextResponse.json({
    success: true,
    expiresAt: expiresAt.toISOString(),
    deepLink: `https://t.me/${username}?start=${encodeURIComponent(token)}`,
  });
}

export async function DELETE() {
  const auth = await requirePrivilegedSession();
  if ("error" in auth && auth.error) return auth.error;
  const doctor = auth.doctor!;

  await prisma.telegramIdentity.deleteMany({ where: { doctorId: doctor.id } });
  await prisma.telegramLinkChallenge.updateMany({
    where: { doctorId: doctor.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await writeAudit({
    doctorId: doctor.id,
    action: "telegram_unlinked",
    entity: "TelegramIdentity",
    meta: {},
  });

  return NextResponse.json({ success: true, linked: false });
}
