-- Phase 9A: preserve records by deactivating accounts/clinic memberships instead of deleting them.
-- Guarded so empty CI databases can proceed; production DBs already have these tables.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Doctor') THEN
    ALTER TABLE "Doctor" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE "Doctor" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);
    CREATE INDEX IF NOT EXISTS "Doctor_isActive_idx" ON "Doctor"("isActive");
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Clinic') THEN
    ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);
    CREATE INDEX IF NOT EXISTS "Clinic_isActive_idx" ON "Clinic"("isActive");
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ClinicMember') THEN
    ALTER TABLE "ClinicMember" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE "ClinicMember" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);
    CREATE INDEX IF NOT EXISTS "ClinicMember_isActive_idx" ON "ClinicMember"("isActive");
  END IF;
END $$;
