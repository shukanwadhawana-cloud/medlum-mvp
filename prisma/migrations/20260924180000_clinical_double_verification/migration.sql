-- Clinical double verification and final signing
CREATE TABLE "ClinicalNote" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "encounterId" TEXT,
  "authorDoctorId" TEXT NOT NULL,
  "verifierDoctorId" TEXT,
  "noteType" TEXT NOT NULL DEFAULT 'Consultant Note',
  "title" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "contentHash" TEXT NOT NULL DEFAULT '',
  "finalHash" TEXT NOT NULL DEFAULT '',
  "submittedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClinicalNote_clinicId_patientId_createdAt_idx" ON "ClinicalNote"("clinicId","patientId","createdAt");
CREATE INDEX "ClinicalNote_authorDoctorId_idx" ON "ClinicalNote"("authorDoctorId");
CREATE INDEX "ClinicalNote_verifierDoctorId_idx" ON "ClinicalNote"("verifierDoctorId");
CREATE INDEX "ClinicalNote_status_idx" ON "ClinicalNote"("status");
CREATE INDEX "ClinicalNote_encounterId_idx" ON "ClinicalNote"("encounterId");

ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_encounterId_fkey"
  FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_authorDoctorId_fkey"
  FOREIGN KEY ("authorDoctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_verifierDoctorId_fkey"
  FOREIGN KEY ("verifierDoctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
