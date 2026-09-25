-- MedLum Workforce Hub: unified people/workforce records
-- Covers HRIS, lifecycle, recruitment, onboarding, leave, shifts, payroll, expenses,
-- performance, learning, career/skills, succession, discipline, compensation and collaboration.
-- Additive only.

CREATE TABLE IF NOT EXISTS "WorkforceRecord" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "memberId" TEXT,
  "module" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "data" JSONB NOT NULL DEFAULT '{}',
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkforceRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkforceRecord_clinicId_module_status_idx"
  ON "WorkforceRecord"("clinicId","module","status");
CREATE INDEX IF NOT EXISTS "WorkforceRecord_clinicId_createdAt_idx"
  ON "WorkforceRecord"("clinicId","createdAt");
CREATE INDEX IF NOT EXISTS "WorkforceRecord_memberId_module_idx"
  ON "WorkforceRecord"("memberId","module");
CREATE INDEX IF NOT EXISTS "WorkforceRecord_startAt_endAt_idx"
  ON "WorkforceRecord"("startAt","endAt");

DO $$ BEGIN
  ALTER TABLE "WorkforceRecord"
    ADD CONSTRAINT "WorkforceRecord_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkforceRecord"
    ADD CONSTRAINT "WorkforceRecord_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "ClinicMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
