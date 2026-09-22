-- Stage P1: Clinical Staff ID + letterhead reserve for print templates
-- Additive only; safe for existing data.

ALTER TABLE "ClinicMember" ADD COLUMN IF NOT EXISTS "staffCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClinicMember" ADD COLUMN IF NOT EXISTS "designation" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClinicMember" ADD COLUMN IF NOT EXISTS "department" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicMember_clinicId_staffCode_key"
  ON "ClinicMember"("clinicId", "staffCode")
  WHERE "staffCode" <> '';

CREATE INDEX IF NOT EXISTS "ClinicMember_staffCode_idx" ON "ClinicMember"("staffCode");

ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "letterheadHeightMm" INTEGER NOT NULL DEFAULT 40;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "showMedlumFooter" BOOLEAN NOT NULL DEFAULT true;
