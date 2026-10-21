#!/usr/bin/env node
/**
 * HTTP acceptance for password recovery APIs against the ephemeral PostgreSQL
 * service shared with Clinical Assist runtime CI. Uses synthetic users only.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const base = (process.env.MEDLUM_RUNTIME_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const secretText = process.env.SESSION_SECRET || "";
assert.ok(secretText.length >= 32, "CI SESSION_SECRET must be at least 32 characters");
const prisma = new PrismaClient();
const ids = {
  clinicA: "ci_ca_clinic_a",
  clinicB: "ci_ca_clinic_b",
  ownerA: "ci_ca_owner_a",
  doctorWrongRole: "ci_ca_doctor_wrong_role",
  doctorResetOtp: "ci_ca_password_reset_otp",
  doctorResetLink: "ci_ca_password_reset_link",
};
const emails = {
  [ids.ownerA]: "password-reset-owner@example.invalid",
  [ids.doctorWrongRole]: "clinical-assist-ci-role@example.invalid",
};
const encoder = new TextEncoder();

async function sessionCookie(doctorId, email) {
  const token = await new SignJWT({ doctorId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(encoder.encode(secretText));
  return `medlum_session=${token}`;
}
async function post(path, payload, cookie) {
  const headers = {
    "content-type": "application/json",
    origin: base,
    "x-medlum-requested-with": "MedLum",
  };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    redirect: "manual",
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}
async function assertPassword(doctorId, plain) {
  const doc = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { passwordHash: true, sessionInvalidatedAt: true } });
  assert.ok(doc?.passwordHash, `password hash saved for ${doctorId}`);
  assert.equal(await bcrypt.compare(plain, doc.passwordHash), true, `new password verifies for ${doctorId}`);
  assert.ok(doc.sessionInvalidatedAt, `existing sessions invalidated for ${doctorId}`);
}

async function main() {
  // Same generic response for a known, unlinked account and an unknown Staff ID.
  const knownRequest = await post("/api/auth/password-reset/request", { identifier: "CI-RESET-OTP-001" });
  const unknownRequest = await post("/api/auth/password-reset/request", { identifier: "CI-NOT-A-REAL-STAFF-000" });
  assert.equal(knownRequest.response.status, 200, "eligible format gets generic reset response");
  assert.equal(unknownRequest.response.status, 200, "unknown ID gets the same generic reset response");
  assert.equal(knownRequest.body.message, unknownRequest.body.message, "reset request does not disclose whether an account exists");
  assert.equal(knownRequest.body.success, true, "recovery request accepted without leaking linked-account state");

  // Seed a valid synthetic Telegram OTP and ensure wrong codes do not consume it.
  const otpCode = "314159";
  const otpHash = await bcrypt.hash(otpCode, 10);
  await prisma.otpChallenge.updateMany({
    where: { doctorId: ids.doctorResetOtp, purpose: "password_reset", consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.otpChallenge.create({
    data: {
      doctorId: ids.doctorResetOtp,
      clinicId: ids.clinicB,
      purpose: "password_reset",
      codeHash: otpHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      maxAttempts: 5,
      deliveryChannel: "telegram",
    },
  });
  const badOtp = await post("/api/auth/password-reset/complete", {
    identifier: "CI-RESET-OTP-001", code: "111111",
    newPassword: "Synthetic-Reset-Password-2026!", confirmPassword: "Synthetic-Reset-Password-2026!",
  });
  assert.equal(badOtp.response.status, 400, "wrong OTP is rejected");
  const otpPassword = "Synthetic-Reset-Password-2026!";
  const goodOtp = await post("/api/auth/password-reset/complete", {
    identifier: "CI-RESET-OTP-001", code: otpCode,
    newPassword: otpPassword, confirmPassword: otpPassword,
  });
  assert.equal(goodOtp.response.status, 200, "valid Telegram OTP completes password reset");
  assert.equal(goodOtp.body.success, true, "valid OTP reset returns success");
  await assertPassword(ids.doctorResetOtp, otpPassword);
  const reusedOtp = await post("/api/auth/password-reset/complete", {
    identifier: "CI-RESET-OTP-001", code: otpCode,
    newPassword: otpPassword, confirmPassword: otpPassword,
  });
  assert.equal(reusedOtp.response.status, 400, "OTP cannot be reused");

  // A mismatched confirmation and weak password are rejected server-side.
  const weak = await post("/api/auth/password-reset/complete", {
    identifier: "CI-RESET-OTP-001", code: otpCode,
    newPassword: "short", confirmPassword: "different",
  });
  assert.equal(weak.response.status, 400, "weak password rejected");

  // Only Owner/Admin can issue links, and only for members in their selected clinic.
  const ownerCookie = await sessionCookie(ids.ownerA, "password-reset-owner@example.invalid");
  const linkMember = await prisma.clinicMember.findUnique({
    where: { clinicId_doctorId: { clinicId: ids.clinicA, doctorId: ids.doctorResetLink } },
    select: { id: true, clinicId: true, staffCode: true, doctor: { select: { email: true } } },
  });
  assert.ok(linkMember, "synthetic target staff membership exists");
  const issued = await post(`/api/clinic/staff/${encodeURIComponent(linkMember.id)}/password-reset`, {}, ownerCookie);
  assert.equal(issued.response.status, 200, "clinic owner can issue staff reset link");
  assert.equal(issued.body.success, true, "reset link issued successfully");
  assert.ok(typeof issued.body.token === "string" && issued.body.token.length >= 40, "high-entropy reset token returned to authorized owner only");
  const expectedHash = createHash("sha256").update(issued.body.token).digest("hex");
  const stored = await prisma.otpChallenge.findFirst({
    where: { doctorId: ids.doctorResetLink, purpose: "password_reset_link", codeHash: expectedHash, consumedAt: null },
  });
  assert.ok(stored, "only the token hash is stored in the database");
  assert.ok(stored.expiresAt.getTime() > Date.now() && stored.expiresAt.getTime() <= Date.now() + 30 * 60 * 1000 + 5000, "staff link expires within 30 minutes");

  const crossClinic = await prisma.clinicMember.findUnique({
    where: { clinicId_doctorId: { clinicId: ids.clinicB, doctorId: ids.doctorResetOtp } },
    select: { id: true },
  });
  assert.ok(crossClinic, "synthetic cross-clinic membership exists");
  const crossAttempt = await post(`/api/clinic/staff/${encodeURIComponent(crossClinic.id)}/password-reset`, {}, ownerCookie);
  assert.equal(crossAttempt.response.status, 404, "owner cannot issue link outside current clinic");

  const receptionistCookie = await sessionCookie(ids.doctorWrongRole, emails[ids.doctorWrongRole]);
  const unauthorized = await post(`/api/clinic/staff/${encodeURIComponent(linkMember.id)}/password-reset`, {}, receptionistCookie);
  assert.equal(unauthorized.response.status, 403, "non-admin staff cannot issue a reset link");

  const linkPassword = "Synthetic-Link-Reset-Password-2026!";
  const completedLink = await post("/api/auth/password-reset/complete", {
    token: issued.body.token, newPassword: linkPassword, confirmPassword: linkPassword,
  });
  assert.equal(completedLink.response.status, 200, "valid one-time staff reset link completes password reset");
  assert.equal(completedLink.body.success, true, "valid staff link returns success");
  await assertPassword(ids.doctorResetLink, linkPassword);
  const passwordLogin = await post("/api/auth/login", {
    staffId: linkMember.staffCode || "",
    email: linkMember.doctor.email,
    password: linkPassword,
  });
  assert.equal(passwordLogin.response.status, 200, "the newly set password is accepted by the real login endpoint");
  assert.equal(passwordLogin.body.success, true, "password reset leads to a successful login authentication step");
  assert.equal(passwordLogin.body.doctor?.id, ids.doctorResetLink, "login authenticates the intended synthetic account");
  const reusedLink = await post("/api/auth/password-reset/complete", {
    token: issued.body.token, newPassword: linkPassword, confirmPassword: linkPassword,
  });
  assert.equal(reusedLink.response.status, 400, "staff reset link cannot be reused");

  const expiredRaw = "e".repeat(64);
  await prisma.otpChallenge.create({
    data: {
      doctorId: ids.doctorResetLink,
      clinicId: ids.clinicA,
      purpose: "password_reset_link",
      codeHash: createHash("sha256").update(expiredRaw).digest("hex"),
      expiresAt: new Date(Date.now() - 60_000),
      maxAttempts: 1,
      deliveryChannel: "admin_link",
    },
  });
  const expired = await post("/api/auth/password-reset/complete", {
    token: expiredRaw, newPassword: "Synthetic-Expired-Password-2026!", confirmPassword: "Synthetic-Expired-Password-2026!",
  });
  assert.equal(expired.response.status, 400, "expired reset link rejected");

  console.log("Password reset HTTP runtime acceptance: PASS (synthetic PostgreSQL; no real users or patient data)");
}

main().catch((error) => {
  console.error("Password reset runtime acceptance FAILED:", error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
