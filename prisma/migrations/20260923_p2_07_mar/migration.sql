-- P2-07 MAR persistence foundation
CREATE TABLE "MedicationAdministration" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "prescriptionId" TEXT NOT NULL,
  "encounterId" TEXT,
  "administeringMemberId" TEXT NOT NULL,
  "medicationText" TEXT NOT NULL,
  "medicationName" TEXT NOT NULL,
  "dose" TEXT NOT NULL,
  "doseUnit" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "actualAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "reason" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MedicationAdministration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MedicationAdministration_prescriptionId_medicationText_scheduledAt_key"
  ON "MedicationAdministration"("prescriptionId", "medicationText", "scheduledAt");

CREATE INDEX "MedicationAdministration_clinicId_patientId_idx"
  ON "MedicationAdministration"("clinicId", "patientId");

CREATE INDEX "MedicationAdministration_prescriptionId_idx"
  ON "MedicationAdministration"("prescriptionId");

CREATE INDEX "MedicationAdministration_encounterId_idx"
  ON "MedicationAdministration"("encounterId");

CREATE INDEX "MedicationAdministration_administeringMemberId_idx"
  ON "MedicationAdministration"("administeringMemberId");

CREATE INDEX "MedicationAdministration_scheduledAt_status_idx"
  ON "MedicationAdministration"("scheduledAt", "status");

ALTER TABLE "MedicationAdministration"
  ADD CONSTRAINT "MedicationAdministration_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MedicationAdministration"
  ADD CONSTRAINT "MedicationAdministration_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MedicationAdministration"
  ADD CONSTRAINT "MedicationAdministration_prescriptionId_fkey"
  FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MedicationAdministration"
  ADD CONSTRAINT "MedicationAdministration_encounterId_fkey"
  FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MedicationAdministration"
  ADD CONSTRAINT "MedicationAdministration_administeringMemberId_fkey"
  FOREIGN KEY ("administeringMemberId") REFERENCES "ClinicMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
