-- Patient portal accounts (idempotent for environments that already created the table via ad-hoc SQL)
CREATE TABLE IF NOT EXISTS "PatientPortalAccount" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientPortalAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PatientPortalAccount_patientId_key" ON "PatientPortalAccount"("patientId");
CREATE INDEX IF NOT EXISTS "PatientPortalAccount_clinicId_idx" ON "PatientPortalAccount"("clinicId");
CREATE INDEX IF NOT EXISTS "PatientPortalAccount_phone_idx" ON "PatientPortalAccount"("phone");
CREATE INDEX IF NOT EXISTS "PatientPortalAccount_status_idx" ON "PatientPortalAccount"("status");

DO $$ BEGIN
  ALTER TABLE "PatientPortalAccount" ADD CONSTRAINT "PatientPortalAccount_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PatientPortalAccount" ADD CONSTRAINT "PatientPortalAccount_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AuthRateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key")
);
