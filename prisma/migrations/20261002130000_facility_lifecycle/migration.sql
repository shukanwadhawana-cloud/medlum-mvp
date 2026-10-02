-- Master Owner facility lifecycle controls.
-- Additive only: existing facilities remain ACTIVE and no clinical data is removed.
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "facilityStatus" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "statusReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "statusNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "statusUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "statusUpdatedBy" TEXT;
CREATE INDEX IF NOT EXISTS "Clinic_facilityStatus_idx" ON "Clinic"("facilityStatus");
