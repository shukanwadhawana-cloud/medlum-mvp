-- Preserve every current and future saved draft version for auditability.
CREATE TABLE "ClinicalNoteVersion" (
  "id" TEXT NOT NULL,
  "clinicalNoteId" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "noteType" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "event" TEXT NOT NULL DEFAULT 'DRAFT_SAVED',
  "createdByDoctorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalNoteVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClinicalNoteVersion_clinicalNoteId_version_key" ON "ClinicalNoteVersion"("clinicalNoteId", "version");
CREATE INDEX "ClinicalNoteVersion_clinicId_clinicalNoteId_version_idx" ON "ClinicalNoteVersion"("clinicId", "clinicalNoteId", "version");
CREATE INDEX "ClinicalNoteVersion_createdByDoctorId_createdAt_idx" ON "ClinicalNoteVersion"("createdByDoctorId", "createdAt");
ALTER TABLE "ClinicalNoteVersion" ADD CONSTRAINT "ClinicalNoteVersion_clinicalNoteId_fkey" FOREIGN KEY ("clinicalNoteId") REFERENCES "ClinicalNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNoteVersion" ADD CONSTRAINT "ClinicalNoteVersion_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNoteVersion" ADD CONSTRAINT "ClinicalNoteVersion_createdByDoctorId_fkey" FOREIGN KEY ("createdByDoctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Backfill a truthful baseline for every existing note. Earlier versions cannot be reconstructed.
INSERT INTO "ClinicalNoteVersion" ("id","clinicalNoteId","clinicId","version","title","noteType","content","contentHash","event","createdByDoctorId","createdAt")
SELECT md5(random()::text || clock_timestamp()::text || n."id"), n."id", n."clinicId", n."version", n."title", n."noteType", n."content",
  CASE WHEN n."contentHash" = '' THEN md5('baseline:' || n."content" || ':' || n."version") ELSE n."contentHash" END,
  'BASELINE_MIGRATION', n."authorDoctorId", COALESCE(n."updatedAt", n."createdAt", CURRENT_TIMESTAMP)
FROM "ClinicalNote" n;
