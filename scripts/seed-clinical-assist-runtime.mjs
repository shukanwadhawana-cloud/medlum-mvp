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
  casePatient: "ci_ca_case_patient",
  caseInitialNote: "ci_ca_case_initial_note",
  caseProgressNote: "ci_ca_case_progress_note",
  caseDischargeNote: "ci_ca_case_discharge_note",
  caseEncounter1: "ci_ca_case_encounter_1",
  caseEncounter2: "ci_ca_case_encounter_2",
  caseLab: "ci_ca_case_lab",
  caseDiagnostic: "ci_ca_case_diagnostic",
  casePrescription: "ci_ca_case_prescription",
  caseAdministration: "ci_ca_case_administration",
  caseDispensing: "ci_ca_case_dispensing",
  caseNursingVital: "ci_ca_case_nursing_vital",
  caseHandover: "ci_ca_case_handover",
  caseDischargeAudit: "ci_ca_case_discharge_audit",
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

  // Dedicated, fully synthetic inpatient timeline used only by the ephemeral runtime acceptance job.
  const caseProfile = {
    admissionDate: "2026-10-01T09:00:00+05:30",
    chiefComplaint: "Synthetic fever and cough before admission",
    hpi: "Synthetic history: fever for three days with productive cough.",
    pastHistory: "Synthetic history: type 2 diabetes documented.",
    surgicalHistory: "No synthetic surgical history documented.",
    systemicExam: "Synthetic admission exam: febrile, mild basal crepitations documented.",
    workingDiagnosis: "Synthetic community-acquired pneumonia",
    diagnosis: "Synthetic community-acquired pneumonia",
    consultantName: "Synthetic Attending",
    consultantSpecialty: "General Medicine",
    wardType: "General Ward",
    unitType: "Ward",
    roomNumber: "CI-01",
  };
  const casePatientNotes = "__MEDLUM_CARE_SETTING__:IPD\n__MEDLUM_PROFILE__:" + JSON.stringify(caseProfile);
  await prisma.patient.upsert({
    where: { id: ids.casePatient },
    create: {
      id: ids.casePatient,
      doctorId: ids.ownerA,
      clinicId: ids.clinicA,
      name: "SYNTHETIC IPD CASE SUMMARY PATIENT",
      age: 54,
      gender: "Other",
      phone: "0000000999",
      uhid: "SYNTHETIC-IPD-001",
      allergies: "Synthetic penicillin allergy",
      status: "DISCHARGED",
      notes: casePatientNotes,
      createdAt: new Date("2026-10-01T03:30:00.000Z"),
      updatedAt: new Date("2026-10-03T11:00:00.000Z"),
    },
    update: {
      status: "DISCHARGED",
      notes: casePatientNotes,
      allergies: "Synthetic penicillin allergy",
    },
  });

  const caseNotes = [
    {
      id: ids.caseInitialNote,
      noteType: "Initial Assessment",
      title: "Synthetic Initial Assessment",
      content: "SYNTHETIC QA ONLY. Presenting complaint: fever and productive cough. Admission assessment: febrile, mild basal crepitations. Working diagnosis: synthetic community-acquired pneumonia. Precaution: fall-risk precautions documented.",
      createdAt: new Date("2026-10-01T04:00:00.000Z"),
    },
    {
      id: ids.caseProgressNote,
      noteType: "Progress Note",
      title: "Synthetic Day 2 Progress Note",
      content: "SYNTHETIC QA ONLY. Day 2: cough reduced; continue monitoring respiratory status. Precautions: fall precautions maintained; SpO2 monitoring every 4 hours documented.",
      createdAt: new Date("2026-10-02T06:00:00.000Z"),
    },
    {
      id: ids.caseDischargeNote,
      noteType: "Discharge Note",
      title: "Synthetic Discharge Summary",
      content: "SYNTHETIC QA ONLY. Date and Time of Discharge: 03/10/2026 16:30 IST\nDiagnosis: Synthetic community-acquired pneumonia\nCondition on Discharge: Stable as documented in this synthetic fixture\nAdvice: Synthetic follow-up in 7 days.",
      createdAt: new Date("2026-10-03T11:00:00.000Z"),
    },
  ];
  for (const note of caseNotes) {
    await prisma.clinicalNote.upsert({
      where: { id: note.id },
      create: {
        ...note,
        clinicId: ids.clinicA,
        patientId: ids.casePatient,
        authorDoctorId: ids.ownerA,
        authorRole: "Owner",
        status: note.noteType === "Discharge Note" ? "FINAL" : "DRAFT",
        version: 1,
        contentHash: createHash("sha256").update(note.content).digest("hex"),
      },
      update: {
        content: note.content,
        title: note.title,
        noteType: note.noteType,
        status: note.noteType === "Discharge Note" ? "FINAL" : "DRAFT",
        createdAt: note.createdAt,
      },
    });
  }

  await prisma.encounter.upsert({
    where: { id: ids.caseEncounter1 },
    create: {
      id: ids.caseEncounter1, doctorId: ids.ownerA, patientId: ids.casePatient, date: "2026-10-01",
      chiefComplaint: "Synthetic fever and productive cough", clinicalNotes: "SYNTHETIC QA ONLY admission review",
      diagnosis: "Synthetic community-acquired pneumonia", assessment: "Synthetic admission assessment",
      plan: "Synthetic monitoring and investigation plan", bp: "118/76", pulse: "104", rr: "22", spo2: "93%", temperature: "38.4 C",
      createdAt: new Date("2026-10-01T04:30:00.000Z"),
    },
    update: { diagnosis: "Synthetic community-acquired pneumonia", bp: "118/76", pulse: "104", rr: "22", spo2: "93%", temperature: "38.4 C" },
  });
  await prisma.encounter.upsert({
    where: { id: ids.caseEncounter2 },
    create: {
      id: ids.caseEncounter2, doctorId: ids.ownerA, patientId: ids.casePatient, date: "2026-10-02",
      chiefComplaint: "Synthetic day 2 review", clinicalNotes: "SYNTHETIC QA ONLY cough reduced",
      diagnosis: "Synthetic community-acquired pneumonia", assessment: "Synthetic reassessment",
      plan: "Synthetic continued monitoring", bp: "116/74", pulse: "90", rr: "18", spo2: "96%", temperature: "37.2 C",
      createdAt: new Date("2026-10-02T06:30:00.000Z"),
    },
    update: { assessment: "Synthetic reassessment", bp: "116/74", pulse: "90", rr: "18", spo2: "96%", temperature: "37.2 C" },
  });

  await prisma.labOrder.upsert({
    where: { id: ids.caseLab },
    create: {
      id: ids.caseLab, doctorId: ids.ownerA, patientId: ids.casePatient,
      patientName: "SYNTHETIC IPD CASE SUMMARY PATIENT", testName: "Synthetic CBC",
      category: "Hematology", status: "Result Available", result: "Hemoglobin 9.8 g/dL; WBC 12,400 cells/µL (synthetic)",
      notes: "SYNTHETIC QA ONLY", orderedAt: new Date("2026-10-01T05:00:00.000Z"),
      resultedAt: new Date("2026-10-02T04:30:00.000Z"), createdAt: new Date("2026-10-01T05:00:00.000Z"),
    },
    update: { status: "Result Available", result: "Hemoglobin 9.8 g/dL; WBC 12,400 cells/µL (synthetic)", resultedAt: new Date("2026-10-02T04:30:00.000Z") },
  });
  await prisma.diagnosticOrder.upsert({
    where: { id: ids.caseDiagnostic },
    create: {
      id: ids.caseDiagnostic, doctorId: ids.ownerA, patientId: ids.casePatient,
      patientName: "SYNTHETIC IPD CASE SUMMARY PATIENT", studyName: "Synthetic portable chest X-ray",
      modality: "X-ray", bodyPart: "Chest", indication: "Synthetic admission cough",
      status: "Reported", findings: "Synthetic mild right basal opacity",
      impression: "Synthetic finding only; not for clinical use", notes: "SYNTHETIC QA ONLY",
      orderedAt: new Date("2026-10-01T05:00:00.000Z"),
      performedAt: new Date("2026-10-02T03:30:00.000Z"),
      reportedAt: new Date("2026-10-02T05:00:00.000Z"),
      createdAt: new Date("2026-10-01T05:00:00.000Z"),
    },
    update: { status: "Reported", findings: "Synthetic mild right basal opacity", impression: "Synthetic finding only; not for clinical use", reportedAt: new Date("2026-10-02T05:00:00.000Z") },
  });

  const casePrescription = await prisma.prescription.upsert({
    where: { id: ids.casePrescription },
    create: {
      id: ids.casePrescription, doctorId: ids.ownerA, patientId: ids.casePatient,
      patientName: "SYNTHETIC IPD CASE SUMMARY PATIENT",
      medicines: "Synthetic ceftriaxone 1 g IV BD (order only; synthetic fixture)",
      advice: "SYNTHETIC QA ONLY: review clinical response",
      status: "CONFIRMED",
      createdAt: new Date("2026-10-01T06:00:00.000Z"),
    },
    update: { medicines: "Synthetic ceftriaxone 1 g IV BD (order only; synthetic fixture)", status: "CONFIRMED" },
  });
  const ownerMember = await prisma.clinicMember.findUnique({
    where: { clinicId_doctorId: { clinicId: ids.clinicA, doctorId: ids.ownerA } },
    select: { id: true },
  });
  if (!ownerMember) throw new Error("Synthetic case summary owner membership missing.");
  await prisma.medicationAdministration.upsert({
    where: { id: ids.caseAdministration },
    create: {
      id: ids.caseAdministration, clinicId: ids.clinicA, patientId: ids.casePatient,
      prescriptionId: casePrescription.id, administeringMemberId: ownerMember.id,
      medicationText: "Synthetic ceftriaxone 1 g IV BD", medicationName: "Synthetic ceftriaxone",
      dose: "1", doseUnit: "g", route: "IV", frequency: "BD",
      scheduledAt: new Date("2026-10-02T05:30:00.000Z"),
      actualAt: new Date("2026-10-02T05:45:00.000Z"), status: "ADMINISTERED",
      notes: "SYNTHETIC QA ONLY: administered record",
    },
    update: { status: "ADMINISTERED", actualAt: new Date("2026-10-02T05:45:00.000Z") },
  });
  await prisma.dispensing.upsert({
    where: { id: ids.caseDispensing },
    create: {
      id: ids.caseDispensing, doctorId: ids.ownerA, patientId: ids.casePatient,
      prescriptionId: casePrescription.id, patientName: "SYNTHETIC IPD CASE SUMMARY PATIENT",
      medicines: "Synthetic ceftriaxone 1 g IV BD (dispensing fixture)", status: "Dispensed",
      dispensedAt: new Date("2026-10-02T05:00:00.000Z"), createdAt: new Date("2026-10-02T05:00:00.000Z"),
    },
    update: { status: "Dispensed", dispensedAt: new Date("2026-10-02T05:00:00.000Z") },
  });

  const caseAuditLogs = [
    {
      id: ids.caseNursingVital, action: "create", entity: "NursingVital", entityId: ids.casePatient,
      meta: JSON.stringify({ clinicId: ids.clinicA, patientId: ids.casePatient, bp: "116/74", pulse: "90", rr: "18", spo2: "96%", temperature: "37.2 C", findings: "SYNTHETIC QA ONLY: fall precautions maintained; SpO2 monitored every 4 hours", authorRole: "Nurse" }),
      createdAt: new Date("2026-10-02T07:00:00.000Z"),
    },
    {
      id: ids.caseHandover, action: "HANDOVER", entity: "IPDHandover", entityId: ids.casePatient,
      meta: JSON.stringify({ clinicId: ids.clinicA, patientId: ids.casePatient, receivingTeam: "Synthetic receiving team", receivingRole: "Doctor", context: "SYNTHETIC QA ONLY: respiratory status improving; continue observation" }),
      createdAt: new Date("2026-10-02T08:00:00.000Z"),
    },
    {
      id: ids.caseDischargeAudit, action: "DISCHARGE_COMPLETE", entity: "Patient", entityId: ids.casePatient,
      meta: JSON.stringify({ clinicId: ids.clinicA, patientId: ids.casePatient, status: "DISCHARGED", noteId: ids.caseDischargeNote }),
      createdAt: new Date("2026-10-03T11:00:00.000Z"),
    },
  ];
  for (const log of caseAuditLogs) {
    await prisma.auditLog.upsert({
      where: { id: log.id },
      create: { ...log, doctorId: ids.ownerA },
      update: { action: log.action, entity: log.entity, entityId: log.entityId, meta: log.meta, createdAt: log.createdAt, doctorId: ids.ownerA },
    });
  }

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
