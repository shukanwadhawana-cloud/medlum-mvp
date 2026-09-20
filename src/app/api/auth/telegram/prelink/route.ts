import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createTelegramLinkChallenge, ensureTelegramWebhook, roleRequiresOtp } from "@/lib/otp";
import { normalizeClinicRole } from "@/lib/workflow";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Pre-login Telegram linking.
 * Proves account ownership with email + password, but does NOT create a session.
 * This is intentionally separate from the authenticated Security page flow.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password required." }, { status: 400 });
    }

    const doctor = await prisma.doctor.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, isActive: true, clinicName: true },
    });

    if (!doctor || !(await verifyPassword(password, doctor.passwordHash))) {
      return NextResponse.json({ success: false, error: "Invalid email or password." }, { status: 401 });
    }

    if (!doctor.isActive) {
      return NextResponse.json({ success: false, error: "This account is deactivated." }, { status: 403 });
    }

    const isOwner = isMedlumOwnerEmail(doctor.email);
    if (!isOwner) {
      const membership = await prisma.clinicMember.findFirst({
        where: { doctorId: doctor.id, isActive: true },
        select: { role: true },
        orderBy: { createdAt: "asc" },
      });
      if (!roleRequiresOtp(normalizeClinicRole(membership?.role))) {
        return NextResponse.json({
          success: false,
          error: "Telegram linking is only required for privileged accounts.",
        }, { status: 403 });
      }
    }

    const existing = await prisma.telegramIdentity.findUnique({
      where: { doctorId: doctor.id },
      select: { telegramUsername: true },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyLinked: true,
        telegramUsername: existing.telegramUsername || null,
      });
    }

    const username = String(process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
    if (!username) {
      return NextResponse.json({ success: false, error: "Telegram bot is not configured." }, { status: 503 });
    }

    const webhookUrl = new URL("/api/telegram/webhook", req.url).toString();
    try {
      await ensureTelegramWebhook(webhookUrl);
    } catch (error) {
      console.error("Telegram webhook registration failed:", error);
      return NextResponse.json({ success: false, error: "Telegram could not be configured." }, { status: 503 });
    }

    const { token, expiresAt } = await createTelegramLinkChallenge(doctor.id);
    await writeAudit({
      doctorId: doctor.id,
      action: "telegram_link_started",
      entity: "TelegramLinkChallenge",
      meta: { preLogin: true },
    });

    return NextResponse.json({
      success: true,
      alreadyLinked: false,
      expiresAt: expiresAt.toISOString(),
      deepLink: `https://t.me/${username}?start=${encodeURIComponent(token)}`,
    });
  } catch (error) {
    console.error("pre-login Telegram link failed", error);
    return NextResponse.json({ success: false, error: "Unable to start Telegram linking." }, { status: 500 });
  }
}
