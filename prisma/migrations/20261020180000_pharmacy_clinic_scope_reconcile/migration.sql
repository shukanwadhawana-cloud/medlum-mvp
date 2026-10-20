-- Reconcile the PharmacyItem clinic scope already present in production.
-- The earlier applied migration is missing from repository history, so this
-- forward repair is deliberately idempotent: it adds only absent objects.
ALTER TABLE "PharmacyItem"
  ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

CREATE INDEX IF NOT EXISTS "PharmacyItem_clinicId_idx"
  ON "PharmacyItem" ("clinicId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PharmacyItem_clinicId_fkey'
      AND conrelid = 'public."PharmacyItem"'::regclass
  ) THEN
    ALTER TABLE "PharmacyItem"
      ADD CONSTRAINT "PharmacyItem_clinicId_fkey"
      FOREIGN KEY ("clinicId")
      REFERENCES "Clinic" ("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;
