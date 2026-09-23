import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { encryptSecret } from "@/lib/secret-crypto";
import { saveClinicSetup } from "@/lib/clinic-products";
import { ensureFacilityTelegramWebhook } from "@/lib/facility-telegram";

async function owner() {
  const session = await getSession();
  if (!session) return null;
  const doctor = await prisma.doctor.findUnique({ where: { id: session.doctorId }, select: { id: true, email: true } });
  if (!doctor || !isMedlumOwnerEmail(doctor.email)) return null;
  return doctor;
}

export async function GET() {
  const user = await owner();
  if (!user) return NextResponse.json({ success: false, error: "Master Owner access required." }, { status: 403 });
  const facilities = await prisma.clinic.findMany({
    orderBy: { createdAt: "desc" },
    include: { telegramIntegration: { select: { botUsername: true, chatId: true, enabled: true, status: true, lastVerifiedAt: true } }, _count: { select: { members: true, patients: true } } }
  });
  return NextResponse.json({ success: true, facilities });
}

export async function POST(req: Request) {
  const user = await owner();
  if (!user) return NextResponse.json({ success: false, error: "Master Owner access required." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const facilityType = body.facilityType === "HOSPITAL" ? "HOSPITAL" : "CLINIC";
  const subscriptionModel = ["OPD", "IPD", "BOTH"].includes(body.subscriptionModel) ? body.subscriptionModel : "BOTH";
  const address = String(body.address || "").trim();
  const city = String(body.city || "").trim();
  const state = String(body.state || "").trim();
  const pincode = String(body.pincode || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  const ownerName = String(body.ownerName || "").trim();
  const facilityOwnerEmail = String(body.facilityOwnerEmail || "").trim().toLowerCase();
  const doctorInCharge = String(body.doctorInCharge || "").trim();
  const licenseNumber = String(body.licenseNumber || "").trim();
  const registrationNumber = String(body.registrationNumber || "").trim();
  const telegramToken = String(body.telegramToken || "").trim();
  const telegramChatId = String(body.telegramChatId || "").trim();

  if (!name || !ownerName || !facilityOwnerEmail || !doctorInCharge || !address || !city || !state || !pincode)
    return NextResponse.json({ success: false, error: "Facility name, facility owner email, doctor in charge and complete address are required." }, { status: 400 });
  if (isMedlumOwnerEmail(facilityOwnerEmail) && facilityOwnerEmail !== user.email.toLowerCase())
    return NextResponse.json({ success: false, error: "The Enterprise Master Owner cannot be assigned as owner of another person's facility." }, { status: 400 });

  const facilityOwner = await prisma.doctor.findUnique({ where: { email: facilityOwnerEmail }, select: { id: true, email: true } });
  if (!facilityOwner)
    return NextResponse.json({ success: false, error: "Facility owner must already have a MedLum doctor account. Create/sign in that doctor account first, then provision the facility." }, { status: 400 });
  if (facilityType === "HOSPITAL" && (!licenseNumber || !registrationNumber))
    return NextResponse.json({ success: false, error: "Hospital license and registration numbers are required." }, { status: 400 });
  if (telegramToken && !process.env.MEDLUM_TELEGRAM_ENCRYPTION_KEY)
    return NextResponse.json({ success: false, error: "Telegram encryption is not configured on the server." }, { status: 500 });
  if (telegramToken && !telegramChatId)
    return NextResponse.json({ success: false, error: "Telegram notification chat ID is required when a facility bot token is provided." }, { status: 400 });

  let telegram: { username: string; verified: boolean } | null = null;
  if (telegramToken) {
    const response = await fetch("https://api.telegram.org/bot" + telegramToken + "/getMe", { cache: "no-store" });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok || !result?.result?.username)
      return NextResponse.json({ success: false, error: "Telegram token could not be verified. Check the BotFather token." }, { status: 400 });
    telegram = { username: result.result.username, verified: true };
  }

  const clinic = await prisma.$transaction(async tx => {
    const created = await tx.clinic.create({
      data: { name, address, phone, email, registrationNo: registrationNumber, isActive: true }
    });
    await tx.clinicMember.create({
      data: { clinicId: created.id, doctorId: facilityOwner.id, role: "Owner", designation: "Facility Owner", isActive: true }
    });
    if (telegram) {
      await tx.facilityTelegramIntegration.create({
        data: { clinicId: created.id, botUsername: telegram.username, encryptedToken: encryptSecret(telegramToken), chatId: telegramChatId, status: "CONNECTED", lastVerifiedAt: new Date() }
      });
    }
    return created;
  });

  await saveClinicSetup(clinic.id, { facilityType, subscriptionModel, licenseNumber, registrationNumber, ownerName, doctorInCharge, address, city, state, pincode, phone, email, onboardingCompleted: true });

  // Outbound facility notifications work independently of the webhook. If the
  // global Telegram webhook secret is configured, also register this facility's
  // bot on its own opaque clinic-scoped endpoint.
  if (telegram) {
    try {
      await ensureFacilityTelegramWebhook(clinic.id);
    } catch (error) {
      console.error("[MedLum Facility Telegram] webhook registration skipped", {
        clinicId: clinic.id,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return NextResponse.json({
    success: true,
    facility: { ...clinic, facilityType, subscriptionModel, ownerName, facilityOwnerEmail: facilityOwner.email, doctorInCharge, licenseNumber, registrationNumber, telegram: telegram ? { botUsername: telegram.username, chatId: telegramChatId, status: "CONNECTED" } : null }
  }, { status: 201 });
}