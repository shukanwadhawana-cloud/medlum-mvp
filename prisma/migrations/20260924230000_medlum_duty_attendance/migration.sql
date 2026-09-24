-- MedLum Duty: per-hospital geofenced attendance
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "dutyLat" DOUBLE PRECISION;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "dutyLng" DOUBLE PRECISION;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "dutyRadiusMeters" INTEGER NOT NULL DEFAULT 200;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "dutyEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "DutyAttendanceEvent" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "punchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'SELF',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracyMeters" DOUBLE PRECISION,
    "withinGeofence" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT NOT NULL DEFAULT '',
    "adminDoctorId" TEXT,
    "saniddhiSyncAt" TIMESTAMP(3),
    "saniddhiRef" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DutyAttendanceEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DutyAttendanceEvent_clinicId_punchedAt_idx" ON "DutyAttendanceEvent"("clinicId", "punchedAt");
CREATE INDEX IF NOT EXISTS "DutyAttendanceEvent_memberId_punchedAt_idx" ON "DutyAttendanceEvent"("memberId", "punchedAt");
CREATE INDEX IF NOT EXISTS "DutyAttendanceEvent_doctorId_punchedAt_idx" ON "DutyAttendanceEvent"("doctorId", "punchedAt");
CREATE INDEX IF NOT EXISTS "DutyAttendanceEvent_clinicId_type_punchedAt_idx" ON "DutyAttendanceEvent"("clinicId", "type", "punchedAt");

DO $$ BEGIN
  ALTER TABLE "DutyAttendanceEvent" ADD CONSTRAINT "DutyAttendanceEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DutyAttendanceEvent" ADD CONSTRAINT "DutyAttendanceEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ClinicMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
