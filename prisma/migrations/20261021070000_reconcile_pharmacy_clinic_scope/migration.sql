-- Reconcile PharmacyItem clinic scoping across environments.
-- Idempotent because production may already contain this column/index/FK from
-- the missing historical migration 20260923100000_pharmacy_clinic_scope.
ALTER TABLE "PharmacyItem" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

CREATE INDEX IF NOT EXISTS "PharmacyItem_clinicId_idx"
  ON "PharmacyItem"("clinicId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PharmacyItem_clinicId_fkey'
      AND conrelid = '"PharmacyItem"'::regclass
  ) THEN
    ALTER TABLE "PharmacyItem"
      ADD CONSTRAINT "PharmacyItem_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
