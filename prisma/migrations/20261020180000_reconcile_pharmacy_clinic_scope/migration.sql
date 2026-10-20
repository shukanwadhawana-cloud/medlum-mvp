-- Reconcile the PharmacyItem clinic scope against the production shape.
-- Existing production already has this nullable column, index, and FK. IF NOT
-- EXISTS guards make this a no-op there while keeping clean installs aligned
-- with prisma/schema.prisma. Do not backfill ambiguous legacy rows here.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'PharmacyItem'
      AND column_name = 'clinicId'
  ) THEN
    ALTER TABLE "PharmacyItem" ADD COLUMN "clinicId" TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PharmacyItem_clinicId_idx"
  ON "PharmacyItem"("clinicId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PharmacyItem_clinicId_fkey'
      AND conrelid = '"PharmacyItem"'::regclass
  ) THEN
    ALTER TABLE "PharmacyItem"
      ADD CONSTRAINT "PharmacyItem_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
