-- Hospital foundation: OTP, tariff versioning, lab templates, patient lifecycle, clinic branding
-- Non-destructive additive migration

-- Clinic branding
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "address" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "phone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "email" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "registrationNo" TEXT NOT NULL DEFAULT '';

-- Patient lifecycle
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "registrationNo" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "uhid" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "deletionReason" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "Patient_status_idx" ON "Patient"("status");
CREATE INDEX IF NOT EXISTS "Patient_deletedAt_idx" ON "Patient"("deletedAt");
CREATE INDEX IF NOT EXISTS "Patient_registrationNo_idx" ON "Patient"("registrationNo");
CREATE INDEX IF NOT EXISTS "Patient_uhid_idx" ON "Patient"("uhid");

-- OtpChallenge
CREATE TABLE IF NOT EXISTS "OtpChallenge" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "clinicId" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'login',
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "deliveryChannel" TEXT NOT NULL DEFAULT 'console',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OtpChallenge_doctorId_purpose_consumedAt_idx" ON "OtpChallenge"("doctorId", "purpose", "consumedAt");
CREATE INDEX IF NOT EXISTS "OtpChallenge_expiresAt_idx" ON "OtpChallenge"("expiresAt");
CREATE INDEX IF NOT EXISTS "OtpChallenge_clinicId_idx" ON "OtpChallenge"("clinicId");

DO $$ BEGIN
  ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TariffVersion
CREATE TABLE IF NOT EXISTS "TariffVersion" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sourceFile" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TariffVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TariffVersion_clinicId_isActive_idx" ON "TariffVersion"("clinicId", "isActive");
CREATE INDEX IF NOT EXISTS "TariffVersion_clinicId_effectiveFrom_idx" ON "TariffVersion"("clinicId", "effectiveFrom");

DO $$ BEGIN
  ALTER TABLE "TariffVersion" ADD CONSTRAINT "TariffVersion_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TariffItem
CREATE TABLE IF NOT EXISTS "TariffItem" (
    "id" TEXT NOT NULL,
    "tariffVersionId" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "department" TEXT NOT NULL DEFAULT '',
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "esicCode" TEXT NOT NULL DEFAULT '',
    "esicCategory" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "TariffItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TariffItem_tariffVersionId_idx" ON "TariffItem"("tariffVersionId");
CREATE INDEX IF NOT EXISTS "TariffItem_code_idx" ON "TariffItem"("code");
CREATE INDEX IF NOT EXISTS "TariffItem_category_idx" ON "TariffItem"("category");
CREATE INDEX IF NOT EXISTS "TariffItem_name_idx" ON "TariffItem"("name");

DO $$ BEGIN
  ALTER TABLE "TariffItem" ADD CONSTRAINT "TariffItem_tariffVersionId_fkey"
    FOREIGN KEY ("tariffVersionId") REFERENCES "TariffVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- LabTemplate
CREATE TABLE IF NOT EXISTS "LabTemplate" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Hematology',
    "description" TEXT NOT NULL DEFAULT '',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LabTemplate_clinicId_code_key" ON "LabTemplate"("clinicId", "code");
CREATE INDEX IF NOT EXISTS "LabTemplate_code_idx" ON "LabTemplate"("code");
CREATE INDEX IF NOT EXISTS "LabTemplate_isSystem_isActive_idx" ON "LabTemplate"("isSystem", "isActive");

DO $$ BEGIN
  ALTER TABLE "LabTemplate" ADD CONSTRAINT "LabTemplate_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- LabTemplateParameter
CREATE TABLE IF NOT EXISTS "LabTemplateParameter" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "referenceRange" TEXT NOT NULL DEFAULT '',
    "resultType" TEXT NOT NULL DEFAULT 'numeric',
    "decimalPlaces" INTEGER NOT NULL DEFAULT 1,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "criticalLow" DOUBLE PRECISION,
    "criticalHigh" DOUBLE PRECISION,
    "formula" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "LabTemplateParameter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LabTemplateParameter_templateId_displayOrder_idx" ON "LabTemplateParameter"("templateId", "displayOrder");

DO $$ BEGIN
  ALTER TABLE "LabTemplateParameter" ADD CONSTRAINT "LabTemplateParameter_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "LabTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
