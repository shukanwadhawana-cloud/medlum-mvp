#!/usr/bin/env node
/**
 * HTTP runtime acceptance for IPD consultant assignment and transfer.
 * The workflow runs this only against the ephemeral synthetic PostgreSQL fixture.
 */
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

assert.equal(process.env.MEDLUM_CI_SYNTHETIC_FIXTURE, "YES", "This runtime test may only run on the synthetic CI fixture.");
const base = (process.env.MEDLUM_RUNTIME_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
assert.ok(base.startsWith("http://127.0.0.1:") || base.startsWith("http://localhost:"), "Runtime API base must be a local CI server.");
const prisma = new PrismaClient();
const secretText = process.env.SESSION_SECRET || "";
assert.ok(secretText.length >= 32, "CI SESSION_SECRET must be at least 32 characters");

const clinicId = "ci_ca_clinic_a";
const ownerId = "ci_ca_owner_a";
const ownerEmail = "password-reset-owner@example.invalid";
const receptionistId = "ci_ca_doctor_wrong_role";
const receptionistEmail = "clinical-assist-ci-role@example.invalid";
const patientId = "ci_ca_consultant_patient";
const crossClinicPatientId = "ci_ca_patient_b";
const consultantOneDoctorId = "ci_ca_consultant_one";
const consultantTwoDoctorId = "ci_ca_consultant_two";

async function sessionCookie(doctorId, email) {
  const token = await new SignJWT({ doctorId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(secretText));
  return "medlum_session=" + token;
}

async function requestIpd(method, body, cookie) {
  const headers = { origin: base, "x-medlum-requested-with": "MedLum" };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(base + "/api/ipd", {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function snapshot(cookie) {
  const { response, payload } = await requestIpd("GET", undefined, cookie);
  assert.equal(response.status, 200, "authorized facility owner can read the IPD census");
  assert.ok(Array.isArray(payload.handoverOptions), "IPD GET returns clinician options");
  const patient = payload.patients.find((row) => row.id === patientId);
  assert.ok(patient, "synthetic active IPD patient appears in the census");
  return { patient, options: payload.handoverOptions };
}

async function main() {
  const ownerCookie = await sessionCookie(ownerId, ownerEmail);
  const receptionistCookie = await sessionCookie(receptionistId, receptionistEmail);
  const consultantOne = await prisma.clinicMember.findUnique({
    where: { clinicId_doctorId: { clinicId, doctorId: consultantOneDoctorId } },
    select: { id: true, isActive: true },
  });
  const consultantTwo = await prisma.clinicMember.findUnique({
    where: { clinicId_doctorId: { clinicId, doctorId: consultantTwoDoctorId } },
    select: { id: true, isActive: true },
  });
  assert.ok(consultantOne?.isActive && consultantTwo?.isActive, "two synthetic consultant accounts are seeded");

  const unauthenticated = await requestIpd("POST", {
    action: "assign-consultant", patientId, consultantMemberId: consultantOne.id,
  }, null);
  assert.equal(unauthenticated.response.status, 401, "consultant assignment requires authentication");

  const before = await snapshot(ownerCookie);
  for (const doctorId of [consultantOneDoctorId, consultantTwoDoctorId]) {
    assert.ok(before.options.some((option) => option.doctorId === doctorId && option.consultantEligible),
      "active consultant from this facility appears in the assignment options");
  }

  const receptionistAttempt = await requestIpd("POST", {
    action: "assign-consultant", patientId, consultantMemberId: consultantOne.id,
  }, receptionistCookie);
  assert.equal(receptionistAttempt.response.status, 403, "receptionist cannot assign clinical responsibility");

  const first = await requestIpd("POST", {
    action: "assign-consultant", patientId, consultantMemberId: consultantOne.id,
  }, ownerCookie);
  assert.equal(first.response.status, 200, "first consultant assignment is accepted");
  assert.equal(first.payload.success, true, "first assignment succeeds");
  assert.equal(first.payload.transferred, false, "initial assignment is not mislabeled as a transfer");

  const afterFirst = await snapshot(ownerCookie);
  assert.equal(afterFirst.patient.consultantMemberId, consultantOne.id, "initial consultant membership persists");
  assert.equal(afterFirst.patient.consultantName, "Synthetic Consultant One", "current consultant name is returned by the IPD census");

  const missingReason = await requestIpd("POST", {
    action: "assign-consultant", patientId, consultantMemberId: consultantTwo.id,
  }, ownerCookie);
  assert.equal(missingReason.response.status, 400, "transfer without a reason is rejected");
  assert.equal((await snapshot(ownerCookie)).patient.consultantMemberId, consultantOne.id,
    "rejected transfer leaves current consultant unchanged");

  const transferred = await requestIpd("POST", {
    action: "assign-consultant",
    patientId,
    consultantMemberId: consultantTwo.id,
    context: "Synthetic consultant rota change for runtime acceptance.",
  }, ownerCookie);
  assert.equal(transferred.response.status, 200, "transfer with a reason succeeds");
  assert.equal(transferred.payload.success, true, "transfer reports success");
  assert.equal(transferred.payload.transferred, true, "existing assignment is identified as a transfer");

  const afterTransfer = await snapshot(ownerCookie);
  assert.equal(afterTransfer.patient.consultantMemberId, consultantTwo.id, "new consultant membership persists");
  assert.equal(afterTransfer.patient.consultantName, "Synthetic Consultant Two", "transferred consultant appears in the census");
  assert.equal(afterTransfer.patient.consultantSpecialty, "Cardiology", "specialty is resolved from the active clinic member");

  const crossClinic = await requestIpd("POST", {
    action: "assign-consultant", patientId: crossClinicPatientId, consultantMemberId: consultantOne.id,
  }, ownerCookie);
  assert.equal(crossClinic.response.status, 404, "cannot assign consultant to another clinic's patient");

  const audit = await prisma.auditLog.findMany({
    where: { entity: "IPDConsultantAssignment", entityId: patientId, doctorId: ownerId },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(audit.length, 2, "only successful assignment and transfer create audit events");
  const firstMeta = JSON.parse(audit[0].meta || "{}");
  const transferMeta = JSON.parse(audit[1].meta || "{}");
  assert.equal(audit[0].action, "CONSULTANT_ASSIGNED", "initial assignment is audited");
  assert.equal(firstMeta.consultantMemberId, consultantOne.id, "initial audit records consultant");
  assert.equal(audit[1].action, "CONSULTANT_TRANSFERRED", "transfer is audited");
  assert.equal(transferMeta.previousConsultantMemberId, consultantOne.id, "transfer audit retains previous consultant");
  assert.equal(transferMeta.consultantMemberId, consultantTwo.id, "transfer audit identifies new consultant");
  assert.equal(transferMeta.reason, "Synthetic consultant rota change for runtime acceptance.", "transfer reason is retained");
  assert.equal(transferMeta.clinicId, clinicId, "audit event is facility-scoped");

  console.log("IPD consultant assignment + transfer HTTP acceptance: PASS (synthetic PostgreSQL; no real patient data)");
}

main().catch((error) => {
  console.error("IPD consultant assignment runtime acceptance FAILED:", error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
