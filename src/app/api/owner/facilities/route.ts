import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { encryptSecret } from "@/lib/secret-crypto";
import { hashPassword } from "@/lib/password";
import { saveClinicSetup } from "@/lib/clinic-products";
import { ensureFacilityTelegramWebhook } from "@/lib/facility-telegram";
import { writeAudit } from "@/lib/audit";

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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(facilityOwnerEmail))
    return NextResponse.json({ success: false, error: "Enter a valid email address that the facility owner controls." }, { status: 400 });
  if (isMedlumOwnerEmail(facilityOwnerEmail) && facilityOwnerEmail !== user.email.toLowerCase())
    return NextResponse.json({ success: false, error: "The Enterprise Master Owner cannot be assigned as owner of another person's facility." }, { status: 400 });
  const existingFacilityOwner = await prisma.doctor.findUnique({ where: { email: facilityOwnerEmail }, select: { id: true, isActive: true } });
  if (existingFacilityOwner && !existingFacilityOwner.isActive)
    return NextResponse.json({ success: false, error: "This email belongs to an inactive MedLum account. Contact MedLum support before assigning facility ownership." }, { status: 409 });
  if (facilityType === "HOSPITAL" && !registrationNumber)
    return NextResponse.json({ success: false, error: "Hospital registration number is required." }, { status: 400 });
  if (telegramToken && !process.env.MEDLUM_TELEGRAM_ENCRYPTION_KEY && !process.env.NEXTAUTH_SECRET && !process.env.SESSION_SECRET)
    return NextResponse.json({ success: false, error: "Telegram encryption is not configured on the server. Configure MEDLUM_TELEGRAM_ENCRYPTION_KEY or the server session secret." }, { status: 500 });

  let telegram: { username: string; verified: boolean } | null = null;
  if (telegramToken) {
    const response = await fetch("https://api.telegram.org/bot" + telegramToken + "/getMe", { cache: "no-store" });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok || !result?.result?.username)
      return NextResponse.json({ success: false, error: "Telegram token could not be verified. Check the BotFather token." }, { status: 400 });
    telegram = { username: result.result.username, verified: true };
  }

  // New owner accounts receive an unguessable temporary password and a one-time
  // password-setup link. Existing accounts are attached without touching their password.
  const temporaryPasswordHash = await hashPassword(randomBytes(48).toString("base64url"));
  const ownerSetupToken = randomBytes(32).toString("base64url");
  const ownerSetupTokenHash = createHash("sha256").update(ownerSetupToken).digest("hex");
  const ownerSetupExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const provisioned = await prisma.$transaction(async tx => {
    let facilityOwner = await tx.doctor.findUnique({
      where: { email: facilityOwnerEmail },
      select: { id: true, email: true, isActive: true },
    });
    let createdOwnerAccount = false;
    if (!facilityOwner) {
      facilityOwner = await tx.doctor.create({
        data: {
          name: ownerName,
          email: facilityOwnerEmail,
          passwordHash: temporaryPasswordHash,
          clinicName: name,
          phone,
          isActive: true,
        },
        select: { id: true, email: true, isActive: true },
      });
      createdOwnerAccount = true;
    }
    if (!facilityOwner.isActive) throw new Error("FACILITY_OWNER_ACCOUNT_INACTIVE");

    const clinic = await tx.clinic.create({
      data: { name, address, phone, email, registrationNo: registrationNumber, isActive: true }
    });
    await tx.clinicMember.create({
      data: { clinicId: clinic.id, doctorId: facilityOwner.id, role: "Owner", designation: "Facility Owner", isActive: true }
    });
    if (telegram) {
      await tx.facilityTelegramIntegration.create({
        data: { clinicId: clinic.id, botUsername: telegram.username, encryptedToken: encryptSecret(telegramToken), chatId: telegramChatId, status: telegramChatId ? "CONNECTED" : "PENDING", lastVerifiedAt: telegramChatId ? new Date() : null }
      });
    }
    if (createdOwnerAccount) {
      await tx.otpChallenge.create({
        data: {
          doctorId: facilityOwner.id,
          clinicId: clinic.id,
          purpose: "password_reset_link",
          codeHash: ownerSetupTokenHash,
          expiresAt: ownerSetupExpiresAt,
          maxAttempts: 1,
          deliveryChannel: "owner_setup_link",
        },
      });
    }
    return { clinic, facilityOwner, createdOwnerAccount };
  });

  const { clinic, facilityOwner, createdOwnerAccount } = provisioned;
  await saveClinicSetup(clinic.id, { facilityType, subscriptionModel, licenseNumber, registrationNumber, ownerName, doctorInCharge, address, city, state, pincode, phone, email, onboardingCompleted: true });

  if (createdOwnerAccount) {
    await writeAudit({
      doctorId: user.id,
      action: "FACILITY_OWNER_ACCOUNT_CREATED",
      entity: "Doctor",
      entityId: facilityOwner.id,
      clinicId: clinic.id,
      meta: { facilityOwnerEmail: facilityOwner.email, setupLinkExpiresInHours: 24 },
    });
  }

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

  let ownerSetup: { setupLink: string; expiresAt: string } | null = null;
  if (createdOwnerAccount) {
    // Keep the bearer token in the URL fragment: browsers do not send it to
    // the server in HTTP requests or referrer headers.
    const setupUrl = new URL("/reset-password", req.url);
    setupUrl.hash = "token=" + encodeURIComponent(ownerSetupToken);
    ownerSetup = { setupLink: setupUrl.toString(), expiresAt: ownerSetupExpiresAt.toISOString() };
  }

  return NextResponse.json({
    success: true,
    facility: { ...clinic, facilityType, subscriptionModel, ownerName, facilityOwnerEmail: facilityOwner.email, doctorInCharge, licenseNumber, registrationNumber, telegram: telegram ? { botUsername: telegram.username, chatId: telegramChatId, status: telegramChatId ? "CONNECTED" : "PENDING" } : null },
    ownerSetup,
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}