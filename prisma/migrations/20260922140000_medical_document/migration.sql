-- MedicalDocument metadata only (binaries live in object storage, not PostgreSQL)

CREATE TABLE IF NOT EXISTS "MedicalDocument" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "labOrderId" TEXT,
    "encounterId" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL DEFAULT '',
    "uploadedBy" TEXT NOT NULL,
    "ocrStatus" TEXT NOT NULL DEFAULT 'NONE',
    "ocrDraft" TEXT NOT NULL DEFAULT '',
    "ocrExtractedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicalDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MedicalDocument_clinicId_storageKey_key" ON "MedicalDocument"("clinicId", "storageKey");
CREATE INDEX IF NOT EXISTS "MedicalDocument_clinicId_idx" ON "MedicalDocument"("clinicId");
CREATE INDEX IF NOT EXISTS "MedicalDocument_patientId_idx" ON "MedicalDocument"("patientId");
CREATE INDEX IF NOT EXISTS "MedicalDocument_labOrderId_idx" ON "MedicalDocument"("labOrderId");
CREATE INDEX IF NOT EXISTS "MedicalDocument_uploadedBy_idx" ON "MedicalDocument"("uploadedBy");
CREATE INDEX IF NOT EXISTS "MedicalDocument_ocrStatus_idx" ON "MedicalDocument"("ocrStatus");
CREATE INDEX IF NOT EXISTS "MedicalDocument_deletedAt_idx" ON "MedicalDocument"("deletedAt");

DO $$ BEGIN
 ALTER TABLE "MedicalDocument" ADD CONSTRAINT "MedicalDocument_clinicId_fkey"
   FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "MedicalDocument" ADD CONSTRAINT "MedicalDocument_patientId_fkey"
   FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "MedicalDocument" ADD CONSTRAINT "MedicalDocument_labOrderId_fkey"
   FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "MedicalDocument" ADD CONSTRAINT "MedicalDocument_uploadedBy_fkey"
   FOREIGN KEY ("uploadedBy") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
