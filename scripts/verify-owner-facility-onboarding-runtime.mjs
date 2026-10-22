#!/usr/bin/env node
/**
 * Runtime acceptance for facility provisioning, Facility Owner login/OTP,
 * Owner dashboard visibility, and clinic-scoped staff creation.
 *
 * This test must run only against the isolated CI PostgreSQL service.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

if (process.env.MEDLUM_CI_SYNTHETIC_FIXTURE !== "YES") {
  throw new Error("Refusing to run outside the explicitly acknowledged synthetic CI fixture.");
}
const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl.includes("127.0.0.1:5432/owner_onboarding_test")) {
  throw new Error("Refusing to run unless DATABASE_URL points to the isolated owner_onboarding_test database.");
}
const baseUrl = (process.env.MEDLUM_RUNTIME_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const sessionSecret = process.env.SESSION_SECRET || "";
const platformOwnerEmail = String(process.env.MEDLUM_OWNER_EMAIL || "").trim().toLowerCase();
assert.ok(sessionSecret.length >= 32, "CI session secret must be at least 32 characters.");
assert.ok(platformOwnerEmail, "MEDLUM_OWNER_EMAIL must name the synthetic platform owner.");

const prisma = new PrismaClient();
const facilityOwnerEmail = "ci-facility-owner@example.invalid";
const ownerPassword = "Synthetic-Facility-Owner-Password-2026!";
const platformPasswordHash = await bcrypt.hash("unused-platform-ci-password", 10);
const platformOwnerId = "ci_onboarding_platform_owner";
const suffix = Date.now().toString();
const facilityName = `SYNTHETIC CI Facility Onboarding Hospital ${suffix}`;
const registrationNumber = `CI-HOSP-REG-${suffix}`;

function sessionCookie(value) {
  return `medlum_session=${value}`;
}

async function signedSession(doctorId, email) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ doctorId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime("30m")
    .sign(new TextEncoder().encode(sessionSecret));
}

async function requestJson(path, options = {}) {
  const headers = {
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...(options.body !== undefined
      ? { "content-type": "application/json", origin: baseUrl, "x-medlum-requested-with": "MedLum" }
      : {}),
  };
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    redirect: "manual",
  });
  const raw = await response.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* keep a compact raw preview for failures */ }
  return { status: response.status, data, raw: raw.slice(0, 500), headers: response.headers };
}

try {
  await prisma.doctor.upsert({
    where: { id: platformOwnerId },
    create: {
      id: platformOwnerId,
      name: "Synthetic CI Platform Owner",
      email: platformOwnerEmail,
      passwordHash: platformPasswordHash,
      clinicName: "MedLum CI Platform",
      phone: "0000000001",
      isActive: true,
    },
    update: {
      email: platformOwnerEmail,
      isActive: true,
      sessionInvalidatedAt: null,
    },
  });
  // The facility owner deliberately does not exist yet: provisioning must create it.
  await prisma.doctor.deleteMany({ where: { email: facilityOwnerEmail } });

  // Confirm the management API is not anonymously accessible.
  const anonymousFacilities = await requestJson("/api/owner/facilities");
  assert.ok([401, 403].includes(anonymousFacilities.status),
    `Anonymous facility-list request must be denied; got ${anonymousFacilities.status} ${anonymousFacilities.raw}`);

  const platformToken = await signedSession(platformOwnerId, platformOwnerEmail);
  const platformCookie = sessionCookie(platformToken);
  const create = await requestJson("/api/owner/facilities", {
    method: "POST",
    cookie: platformCookie,
    body: {
      name: facilityName,
      facilityType: "HOSPITAL",
      subscriptionModel: "BOTH",
      ownerName: "Synthetic CI Facility Owner",
      facilityOwnerEmail,
      doctorInCharge: "Synthetic Doctor in Charge",
      licenseNumber: "",
      registrationNumber,
      address: "1 Synthetic Test Road",
      city: "Vasai",
      state: "Maharashtra",
      pincode: "401208",
      phone: "0000000003",
      email: "ci-hospital@example.invalid",
      telegramToken: "",
    },
  });
  assert.equal(create.status, 201, `Hospital creation with blank optional licence must succeed; got ${create.status}: ${create.raw}`);
  assert.equal(create.data?.success, true, "Facility creation should return success.");
  const facility = create.data.facility;
  assert.ok(facility?.id, "Facility response must include its created ID.");
  assert.equal(create.data.ownerSetup?.expiresAt ? true : false, true, "First-time owner account must receive an expiring setup link.");
  const setupLink = create.data.ownerSetup.setupLink;
  const setupUrl = new URL(setupLink);
  assert.equal(setupUrl.pathname, "/reset-password", "Owner setup link must open the existing password-reset page.");
  assert.equal(setupUrl.search, "", "One-time reset token must not be placed in the URL query string.");
  const setupToken = setupUrl.hash.startsWith("#token=") ? decodeURIComponent(setupUrl.hash.slice(7)) : "";
  assert.ok(setupToken.length >= 40, "One-time owner setup link must include a high-entropy token in its URL fragment.");
  const setupChallenge = await prisma.otpChallenge.findFirst({
    where: { purpose: "password_reset_link", clinicId: facility.id, consumedAt: null },
    select: { id: true, doctorId: true, codeHash: true, expiresAt: true, maxAttempts: true },
  });
  assert.ok(setupChallenge, "A hashed setup challenge must be persisted for the new owner.");
  assert.equal(setupChallenge.codeHash, createHash("sha256").update(setupToken).digest("hex"), "Only the hash of the setup token must be stored.");
  assert.equal(setupChallenge.maxAttempts, 1, "Owner setup token must be one-time use.");
  assert.ok(setupChallenge.expiresAt.getTime() > Date.now(), "Owner setup token must not be expired.");
  assert.equal(facility.facilityOwnerEmail, facilityOwnerEmail, "Facility owner email must remain linked.");
  assert.equal(facility.licenseNumber, "", "Blank licence value must remain blank, not fabricated.");
  assert.equal(facility.registrationNumber, registrationNumber, "Registration number must be preserved.");
  assert.equal(facility.telegram, null, "Facility Telegram integration must remain optional.");
  assert.ok(!JSON.stringify(facility).includes("telegramToken"), "Bot token must never be returned to the caller.");

  const setupPassword = await requestJson("/api/auth/password-reset/complete", {
    method: "POST",
    body: { token: setupToken, newPassword: ownerPassword, confirmPassword: ownerPassword },
  });
  assert.equal(setupPassword.status, 200, `New owner should be able to set their own password through the setup link; got ${setupPassword.status}: ${setupPassword.raw}`);
  assert.equal(setupPassword.data?.success, true, "Owner password setup should succeed.");
  const facilityOwner = await prisma.doctor.findUnique({
    where: { email: facilityOwnerEmail },
    select: { id: true, passwordHash: true, isActive: true, sessionInvalidatedAt: true },
  });
  assert.ok(facilityOwner?.id, "Facility owner account must be created from the supplied Gmail/login email.");
  assert.equal(await bcrypt.compare(ownerPassword, facilityOwner.passwordHash), true, "Chosen owner password must be stored as a hash.");
  assert.ok(facilityOwner.sessionInvalidatedAt, "Password setup must invalidate existing sessions.");
  const facilityOwnerId = facilityOwner.id;

  const reusedSetupToken = await requestJson("/api/auth/password-reset/complete", {
    method: "POST",
    body: { token: setupToken, newPassword: ownerPassword, confirmPassword: ownerPassword },
  });
  assert.equal(reusedSetupToken.status, 400, "Owner setup link must not be reusable.");

  const ownerMembership = await prisma.clinicMember.findUnique({
    where: { clinicId_doctorId: { clinicId: facility.id, doctorId: facilityOwnerId } },
  });
  assert.ok(ownerMembership, "Facility owner membership must be created.");
  assert.equal(ownerMembership.role, "Owner", "Newly created account must receive facility-scoped Owner role.");
  assert.equal(ownerMembership.isActive, true, "Facility owner membership must be active.");

  const setupRows = await prisma.$queryRawUnsafe(
    'SELECT "licenseNumber", "registrationNumber", "onboardingCompleted" FROM "MedLumClinicSetup" WHERE "clinicId" = $1 LIMIT 1',
    facility.id,
  );
  assert.equal(setupRows[0]?.licenseNumber, "", "Saved setup must preserve blank licence number.");
  assert.equal(setupRows[0]?.registrationNumber, registrationNumber, "Saved setup must preserve the Type C/registration identifier.");
  assert.equal(setupRows[0]?.onboardingCompleted, true, "Saved facility setup must be marked complete.");

  const facilities = await requestJson("/api/owner/facilities", { cookie: platformCookie });
  assert.equal(facilities.status, 200, `Master Owner should be able to list facilities; got ${facilities.status}: ${facilities.raw}`);
  assert.ok(facilities.data.facilities.some((x) => x.id === facility.id), "Created hospital must appear in the Master Owner facility list.");

  const overview = await requestJson("/api/owner/overview", { cookie: platformCookie });
  assert.equal(overview.status, 200, `Owner overview should load; got ${overview.status}: ${overview.raw}`);
  assert.ok(overview.data.hospitals.some((x) => x.id === facility.id && x.name === facilityName),
    "Created hospital must appear in the Owner dashboard overview.");

  // Exercise the new MedLum account: chosen password -> OTP challenge -> verified session.
  const login = await requestJson("/api/auth/login", {
    method: "POST",
    body: { email: facilityOwnerEmail, password: ownerPassword },
  });
  assert.equal(login.status, 200, `Facility Owner login should initiate; got ${login.status}: ${login.raw}`);
  assert.equal(login.data?.requiresOtp, true, "Facility Owner login must require OTP verification.");
  assert.equal(login.data?.doctor?.primaryRole, "Owner", "Login must resolve the newly assigned facility Owner role.");
  assert.ok(login.data?.challengeId && login.data?.devOtp, "Synthetic CI should receive a development OTP for verification.");

  const verify = await requestJson("/api/auth/otp/verify", {
    method: "POST",
    body: {
      doctorId: login.data.doctor.id,
      challengeId: login.data.challengeId,
      code: login.data.devOtp,
    },
  });
  assert.equal(verify.status, 200, `Facility Owner OTP verification should succeed; got ${verify.status}: ${verify.raw}`);
  const setCookie = verify.headers.get("set-cookie") || "";
  const sessionMatch = setCookie.match(/medlum_session=([^;]+)/);
  assert.ok(sessionMatch?.[1], "Successful OTP verification must establish the MedLum session cookie.");
  const ownerCookie = `${sessionCookie(sessionMatch[1])}; medlum_active_clinic=${facility.id}`;

  const staffBefore = await requestJson("/api/clinic/staff", { cookie: ownerCookie });
  assert.equal(staffBefore.status, 200, `Facility Owner should be able to open facility staff management; got ${staffBefore.status}: ${staffBefore.raw}`);
  assert.equal(staffBefore.data?.currentMember?.role, "Owner", "Staff management must use the facility-scoped Owner membership.");

  const newStaff = [
    { name: "Synthetic CI Admin", email: `ci-admin-${suffix}@example.invalid`, phone: "0000000004", password: "ci-admin-password-123", role: "Admin" },
    { name: "Synthetic CI Receptionist", email: `ci-reception-${suffix}@example.invalid`, phone: "0000000005", password: "ci-reception-password-123", role: "Receptionist" },
  ];
  const createdStaff = [];
  for (const staff of newStaff) {
    const response = await requestJson("/api/clinic/staff", { method: "POST", cookie: ownerCookie, body: staff });
    assert.equal(response.status, 200, `Owner should be able to create ${staff.role}; got ${response.status}: ${response.raw}`);
    assert.equal(response.data?.success, true, `${staff.role} creation should return success.`);
    assert.equal(response.data.member?.clinicId, facility.id, `${staff.role} membership must be scoped to the new hospital.`);
    assert.equal(response.data.member?.role, staff.role, `${staff.role} should be assigned exactly.`);
    assert.ok(response.data.staffCode, `${staff.role} should receive a MedLum Staff Login ID.`);
    createdStaff.push(response.data.member);
  }

  const staffAfter = await requestJson("/api/clinic/staff", { cookie: ownerCookie });
  assert.equal(staffAfter.status, 200, "Owner should continue to access staff list after creation.");
  for (const created of createdStaff) {
    assert.ok(staffAfter.data.members.some((x) => x.id === created.id && x.role === created.role),
      `New ${created.role} must appear in this hospital's staff list.`);
  }

  console.log(JSON.stringify({
    passed: true,
    facilityCreated: true,
    registrationNumberSaved: true,
    blankLicenceAccepted: true,
    ownerMembershipCreated: true,
    ownerDashboardVisibility: true,
    ownerPasswordAndOtpLogin: true,
    staffRolesCreated: createdStaff.map((x) => x.role),
    facilityScopedStaffVisibility: true,
    realDataTouched: false,
  }));
} catch (error) {
  console.error("Owner facility onboarding runtime acceptance failed:", error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
