import fs from "node:fs";
import assert from "node:assert/strict";

const schema=fs.readFileSync("prisma/schema.prisma","utf8");
const route=fs.readFileSync("src/app/api/ipd/medications/route.ts","utf8");
const panel=fs.readFileSync("src/components/ipd/MedicationAdministrationPanel.tsx","utf8");
const ipd=fs.readFileSync("src/app/ipd/page.tsx","utf8");
const migration=fs.readFileSync("prisma/migrations/20260923_p2_07_mar/migration.sql","utf8");
const pkg=fs.readFileSync("package.json","utf8");
const ci=fs.readFileSync(".github/workflows/ci.yml","utf8");

for (const x of [
  "model MedicationAdministration",
  "patientId String",
  "prescriptionId String",
  "administeringMemberId String",
  "medicationName String",
  "dose String",
  "doseUnit String",
  "route String",
  "scheduledAt DateTime",
  "actualAt DateTime?",
  "status String",
  "reason String",
  "notes String",
  "@@unique([prescriptionId, medicationText, scheduledAt])"
]) assert(schema.includes(x), "MAR schema contract missing: "+x);

for (const x of [
  'getSession()',
  'requireClinicalModule(session.doctorId, "IPD")',
  "canAdministerMedication(membership.role)",
  'patient: { clinicId: access.clinicId }',
  'parseCareSetting(patient.notes) !== "IPD"',
  "prescription.medicines.includes(medicationText)",
  'status !== "SCHEDULED"',
  'status === "ADMINISTERED"',
  "actualAt",
  'entity: "MedicationAdministration"',
  'isolationLevel: "Serializable"',
  'code === "P2034"',
  'code === "P2002"',
  "administeringMemberId: member.id",
  "Dispensed"
]) assert(route.includes(x), "MAR API contract missing: "+x);

assert(!route.includes("prisma.dispensing"), "MAR API must not mutate pharmacy dispensing records");

for (const x of ["SCHEDULED","ADMINISTERED","HELD","OMITTED","REFUSED","CANCELLED","Confirm that you personally administered","Medication Administration Record"]) {
  assert(panel.includes(x), "MAR UI contract missing: "+x);
}
assert(panel.includes('method: "PATCH"'), "MAR UI must use explicit mutation");
assert(panel.includes('setError(body.error'), "MAR UI must surface server errors");
assert(panel.includes("setSelectedPrescriptionId("")"), "MAR UI cancellation must clear local form without a request");
assert(ipd.includes("MedicationAdministrationPanel"), "MAR panel must be mounted in the existing IPD workspace");

for (const x of [
  'CREATE TABLE "MedicationAdministration"',
  'FOREIGN KEY ("clinicId") REFERENCES "Clinic"',
  'FOREIGN KEY ("patientId") REFERENCES "Patient"',
  'FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"',
  'FOREIGN KEY ("encounterId") REFERENCES "Encounter"',
  'FOREIGN KEY ("administeringMemberId") REFERENCES "ClinicMember"',
  'MedicationAdministration_prescriptionId_medicationText_scheduledAt_key'
]) assert(migration.includes(x), "MAR migration contract missing: "+x);

assert(pkg.includes('"test:p2-07"'), "P2-07 npm script missing");
assert(ci.includes("npm run test:p2-07"), "P2-07 CI wiring missing");
for (const p of ["test:p2-01","test:p2-02","test:p2-03","test:p2-04","test:p2-05","test:p2-06"]) assert(pkg.includes('"'+p+'"'), p+" must remain present");
console.log("P2-07 MAR verification: PASS");

const dbUrl = process.env.P2_07_TEST_DATABASE_URL || "";
if (dbUrl) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const suffix = Date.now().toString(36);
  try {
    const clinic = await prisma.clinic.create({ data: { name: "P2-07 MAR Test "+suffix } });
    const doctor = await prisma.doctor.create({ data: { name: "MAR Nurse", email: "mar-"+suffix+"@test.local", passwordHash: "test", clinicName: clinic.name, phone: "9000000000" } });
    const member = await prisma.clinicMember.create({ data: { clinicId: clinic.id, doctorId: doctor.id, role: "Nurse", designation: "Nurse", staffCode: "NUR-0001" } });
    const patient = await prisma.patient.create({ data: { clinicId: clinic.id, doctorId: doctor.id, name: "MAR Patient", age: 40, gender: "Female", phone: "9000000001", status: "ACTIVE", notes: JSON.stringify({ careSetting: "IPD" }) } });
    const prescription = await prisma.prescription.create({ data: { doctorId: doctor.id, patientId: patient.id, patientName: patient.name, medicines: "Ceftriaxone 1 g IV" } });
    const when = new Date(Date.now()+3600000);
    const event = await prisma.medicationAdministration.create({ data: { clinicId: clinic.id, patientId: patient.id, prescriptionId: prescription.id, administeringMemberId: member.id, medicationText: "Ceftriaxone 1 g IV", medicationName: "Ceftriaxone", dose: "1", doseUnit: "g", route: "IV", scheduledAt: when } });
    assert.equal(event.status, "SCHEDULED", "new MAR event must start SCHEDULED");
    let duplicateRejected=false;
    try {
      await prisma.medicationAdministration.create({ data: { clinicId: clinic.id, patientId: patient.id, prescriptionId: prescription.id, administeringMemberId: member.id, medicationText: "Ceftriaxone 1 g IV", medicationName: "Ceftriaxone", dose: "1", doseUnit: "g", route: "IV", scheduledAt: when } });
    } catch (e) { duplicateRejected = String(e?.code||"").includes("P2002"); }
    assert(duplicateRejected, "duplicate scheduled dose must be rejected by database uniqueness");
    await prisma.medicationAdministration.update({ where: { id: event.id }, data: { status: "ADMINISTERED", actualAt: new Date() } });
    const administered = await prisma.medicationAdministration.findUnique({ where: { id: event.id } });
    assert.equal(administered?.status, "ADMINISTERED", "explicit administration state must persist");
    assert.equal(administered?.prescriptionId, prescription.id, "MAR must retain prescription linkage");
    await prisma.medicationAdministration.deleteMany({ where: { clinicId: clinic.id } });
    await prisma.prescription.deleteMany({ where: { patientId: patient.id } });
    await prisma.patient.delete({ where: { id: patient.id } });
    await prisma.clinicMember.delete({ where: { id: member.id } });
    await prisma.doctor.delete({ where: { id: doctor.id } });
    await prisma.clinic.delete({ where: { id: clinic.id } });
    console.log("P2-07 MAR database invariants: PASS");
  } finally {
    await prisma.$disconnect();
  }
}
