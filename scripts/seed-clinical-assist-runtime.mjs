#!/usr/bin/env node
/**
 * Seeds only an ephemeral PostgreSQL database for Clinical Assist runtime acceptance.
 * Refuses to run unless the CI-specific acknowledgement is set.
 */
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

if (process.env.MEDLUM_CI_SYNTHETIC_FIXTURE !== "YES") {
  console.error("Refusing to seed: MEDLUM_CI_SYNTHETIC_FIXTURE=YES is required.");
  process.exit(2);
}
const prisma = new PrismaClient();
const SOURCE = "MEDLUM CI SYNTHETIC REPORT SOURCE FILE — NOT A REAL PATIENT\nFixture: clinical-assist-checksum-v1\n";
const checksum = createHash("sha256").update(SOURCE, "utf8").digest("hex");

const ids = {
  clinicA: "ci_ca_clinic_a",
  clinicB: "ci_ca_clinic_b",
  doctorA: "ci_ca_doctor_a",
  doctorB: "ci_ca_doctor_b",
  doctorNoClinic: "ci_ca_doctor_no_clinic",
  doctorWrongRole: "ci_ca_doctor_wrong_role",
  ownerA: "ci_ca_owner_a",
  doctorResetOtp: "ci_ca_password_reset_otp",
  doctorResetLink: "ci_ca_password_reset_link",
  patientA: "ci_ca_patient_a",
  patientB: "ci_ca_patient_b",
  guardDoc: "ci_ca_guard_document",
  raceDoc: "ci_ca_race_document",
  foreignDoc: "ci_ca_foreign_document",
};
async function main() {
  await prisma.clinic.upsert({
    where: { id: ids.clinicA },
    create: { id: ids.clinicA, name: "Synthetic CI Clinic A" },
    update: {},
  });
  await prisma.clinic.upsert({
    where: { id: ids.clinicB },
    create: { id: ids.clinicB, name: "Synthetic CI Clinic B" },
    update: {},
  });

  const doctors = [
    { id: ids.doctorA, name: "Synthetic Lab Tester", email: "clinical-assist-ci-a@example.invalid", clinicName: "Synthetic CI Clinic A", phone: "0000000001" },
    { id: ids.doctorB, name: "Synthetic Clinic B Tester", email: "clinical-assist-ci-b@example.invalid", clinicName: "Synthetic CI Clinic B", phone: "0000000002" },
    { id: ids.doctorNoClinic, name: "Synthetic No Membership", email: "clinical-assist-ci-none@example.invalid", clinicName: "No Clinic", phone: "0000000003" },
    { id: ids.doctorWrongRole, name: "Synthetic Receptionist", email: "clinical-assist-ci-role@example.invalid", clinicName: "Synthetic CI Clinic A", phone: "0000000004" },
    { id: ids.ownerA, name: "Synthetic Password Reset Owner", email: "password-reset-owner@example.invalid", clinicName: "Synthetic CI Clinic A", phone: "0000000005" },
    { id: ids.doctorResetOtp, name: "Synthetic Password Reset OTP User", email: "password-reset-otp@example.invalid", clinicName: "Synthetic CI Clinic B", phone: "0000000006" },
    { id: ids.doctorResetLink, name: "Synthetic Password Reset Link User", email: "password-reset-link@example.invalid", clinicName: "Synthetic CI Clinic A", phone: "0000000007" },
  ];
  for (const doctor of doctors) {
    await prisma.doctor.upsert({
      where: { id: doctor.id },
      create: { ...doctor, passwordHash: "unused-runtime-fixture-password-hash", isActive: true },
      update: { isActive: true, sessionInvalidatedAt: null },
    });
  }

  await prisma.clinicMember.upsert({
    where: { clinicId_doctorId: { clinicId: ids.clinicA, doctorId: ids.doctorA } },
    create: { clinicId: ids.clinicA, doctorId: ids.doctorA, role: "Laboratory", staffCode: "CI-LAB-001", isActive: true },
    update: { role: "Laboratory", isActive: true },
  });
  await prisma.clinicMember.upsert({
    where: { clinicId_doctorId: { clinicId: ids.clinicB, doctorId: ids.doctorB } },
    create: { clinicId: ids.clinicB, doctorId: ids.doctorB, role: "Laboratory", staffCode: "CI-LAB-002", isActive: true },
    update: { role: "Laboratory", isActive: true },
  });
  await prisma.clinicMember.upsert({
    where: { clinicId_doctorId: { clinicId: ids.clinicA, doctorId: ids.doctorWrongRole } },
    create: { clinicId: ids.clinicA, doctorId: ids.doctorWrongRole, role: "Receptionist", staffCode: "CI-REC-001", isActive: true },
    update: { role: "Receptionist", isActive: true },
  });

  await prisma.clinicMember.upsert({
    where: { clinicId_doctorId: { clinicId: ids.clinicA, doctorId: ids.ownerA } },
    create: { clinicId: ids.clinicA, doctorId: ids.ownerA, role: "Owner", staffCode: "CI-OWNER-001", isActive: true },
    update: { role: "Owner", isActive: true },
  });
  await prisma.clinicMember.upsert({
    where: { clinicId_doctorId: { clinicId: ids.clinicB, doctorId: ids.doctorResetOtp } },
    create: { clinicId: ids.clinicB, doctorId: ids.doctorResetOtp, role: "Laboratory", staffCode: "CI-RESET-OTP-001", isActive: true },
    update: { role: "Laboratory", isActive: true },
  });
  await prisma.clinicMember.upsert({
    where: { clinicId_doctorId: { clinicId: ids.clinicA, doctorId: ids.doctorResetLink } },
    create: { clinicId: ids.clinicA, doctorId: ids.doctorResetLink, role: "Receptionist", staffCode: "CI-RESET-LINK-001", isActive: true },
    update: { role: "Receptionist", isActive: true },
  });

  await prisma.patient.upsert({
    where: { id: ids.patientA },
    create: { id: ids.patientA, doctorId: ids.doctorA, clinicId: ids.clinicA, name: "SYNTHETIC QA PATIENT A", age: 35, gender: "Other", phone: "0000000101" },
    update: {},
  });
  await prisma.patient.upsert({
    where: { id: ids.patientB },
    create: { id: ids.patientB, doctorId: ids.doctorB, clinicId: ids.clinicB, name: "SYNTHETIC QA PATIENT B", age: 36, gender: "Other", phone: "0000000102" },
    update: {},
  });

  const documentData = [
    { id: ids.guardDoc, clinicId: ids.clinicA, patientId: ids.patientA, uploadedBy: ids.doctorA, storageKey: "ci/clinical-assist/guard.txt" },
    { id: ids.raceDoc, clinicId: ids.clinicA, patientId: ids.patientA, uploadedBy: ids.doctorA, storageKey: "ci/clinical-assist/race.txt" },
    { id: ids.foreignDoc, clinicId: ids.clinicB, patientId: ids.patientB, uploadedBy: ids.doctorB, storageKey: "ci/clinical-assist/foreign.txt" },
  ];
  for (const doc of documentData) {
    await prisma.medicalDocument.upsert({
      where: { id: doc.id },
      create: {
        ...doc,
        originalFileName: "synthetic-lab-report.txt",
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength(SOURCE, "utf8"),
        checksum,
        ocrStatus: "FAILED",
        ocrDraft: "",
      },
      update: {
        checksum,
        ocrStatus: "FAILED",
        ocrDraft: "",
        ocrExtractedAt: null,
        verifiedAt: null,
        verifiedBy: null,
        deletedAt: null,
      },
    });
  }
  console.log("Seeded isolated synthetic Clinical Assist fixtures; no real patient data used.");
}
main().catch((error) => {
  console.error("Synthetic fixture seeding failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
