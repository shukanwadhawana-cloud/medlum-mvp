CREATE TABLE IF NOT EXISTS "ImagingStudy" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "diagnosticOrderId" TEXT,
    "studyInstanceUid" TEXT NOT NULL,
    "accessionNumber" TEXT NOT NULL DEFAULT '',
    "modality" TEXT NOT NULL DEFAULT 'OT',
    "description" TEXT NOT NULL DEFAULT '',
    "studyDate" TIMESTAMP(3),
    "orthancId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdByDoctorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImagingStudy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImagingStudy_clinicId_studyInstanceUid_key"
  ON "ImagingStudy"("clinicId", "studyInstanceUid");
CREATE INDEX IF NOT EXISTS "ImagingStudy_clinicId_idx" ON "ImagingStudy"("clinicId");
CREATE INDEX IF NOT EXISTS "ImagingStudy_patientId_idx" ON "ImagingStudy"("patientId");
CREATE INDEX IF NOT EXISTS "ImagingStudy_diagnosticOrderId_idx" ON "ImagingStudy"("diagnosticOrderId");
CREATE INDEX IF NOT EXISTS "ImagingStudy_status_idx" ON "ImagingStudy"("status");
CREATE INDEX IF NOT EXISTS "ImagingStudy_studyDate_idx" ON "ImagingStudy"("studyDate");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ImagingStudy_clinicId_fkey') THEN
    ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ImagingStudy_patientId_fkey') THEN
    ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ImagingStudy_diagnosticOrderId_fkey') THEN
    ALTER TABLE "ImagingStudy" ADD CONSTRAINT "ImagingStudy_diagnosticOrderId_fkey"
      FOREIGN KEY ("diagnosticOrderId") REFERENCES "DiagnosticOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
