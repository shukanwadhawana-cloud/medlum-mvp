-- MedLum Duty workforce admin: leave/regularization requests + grace minutes
-- Additive only. Safe for production.

ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "dutyGraceMinutes" INTEGER NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS "DutyAttendanceRequest" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "requestType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "dayDate" DATE NOT NULL,
  "requestedInAt" TIMESTAMP(3),
  "requestedOutAt" TIMESTAMP(3),
  "reason" TEXT NOT NULL DEFAULT '',
  "reviewerDoctorId" TEXT,
  "reviewerNote" TEXT NOT NULL DEFAULT '',
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DutyAttendanceRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DutyAttendanceRequest_clinicId_status_idx"
  ON "DutyAttendanceRequest"("clinicId", "status");
CREATE INDEX IF NOT EXISTS "DutyAttendanceRequest_memberId_dayDate_idx"
  ON "DutyAttendanceRequest"("memberId", "dayDate");
CREATE INDEX IF NOT EXISTS "DutyAttendanceRequest_clinicId_createdAt_idx"
  ON "DutyAttendanceRequest"("clinicId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "DutyAttendanceRequest"
    ADD CONSTRAINT "DutyAttendanceRequest_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DutyAttendanceRequest"
    ADD CONSTRAINT "DutyAttendanceRequest_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "ClinicMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
