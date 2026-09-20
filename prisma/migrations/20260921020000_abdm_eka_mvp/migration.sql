-- ABDM / EKA MVP: patient ABHA identity, clinic HIP, consent, care context, event log

ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "ekaHipId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "ekaHipCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "ekaOnboardedAt" TIMESTAMP(3);

ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "abhaNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "abhaAddress" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "abhaStatus" TEXT NOT NULL DEFAULT 'NOT_LINKED';
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "abhaTxnId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "abhaLinkedAt" TIMESTAMP(3);
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "abhaVerifiedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AbdmConsent" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "purpose" TEXT NOT NULL DEFAULT 'Care management',
    "consentInitId" TEXT NOT NULL DEFAULT '',
    "txnId" TEXT NOT NULL DEFAULT '',
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "recordTypes" TEXT NOT NULL DEFAULT '[]',
    "careContextIds" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AbdmConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AbdmCareContext" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "hiTypes" TEXT NOT NULL DEFAULT '[]',
    "linkStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ekaReference" TEXT NOT NULL DEFAULT '',
    "linkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AbdmCareContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AbdmEvent" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT,
    "transactionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AbdmEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Clinic_ekaHipId_idx" ON "Clinic"("ekaHipId");
CREATE INDEX IF NOT EXISTS "Patient_abhaStatus_idx" ON "Patient"("abhaStatus");
CREATE INDEX IF NOT EXISTS "Patient_abhaNumber_idx" ON "Patient"("abhaNumber");
CREATE INDEX IF NOT EXISTS "AbdmConsent_clinicId_idx" ON "AbdmConsent"("clinicId");
CREATE INDEX IF NOT EXISTS "AbdmConsent_patientId_idx" ON "AbdmConsent"("patientId");
CREATE INDEX IF NOT EXISTS "AbdmConsent_doctorId_idx" ON "AbdmConsent"("doctorId");
CREATE INDEX IF NOT EXISTS "AbdmConsent_status_idx" ON "AbdmConsent"("status");
CREATE INDEX IF NOT EXISTS "AbdmConsent_consentInitId_idx" ON "AbdmConsent"("consentInitId");
CREATE INDEX IF NOT EXISTS "AbdmConsent_txnId_idx" ON "AbdmConsent"("txnId");
CREATE UNIQUE INDEX IF NOT EXISTS "AbdmCareContext_clinicId_sourceType_sourceId_key" ON "AbdmCareContext"("clinicId", "sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "AbdmCareContext_clinicId_idx" ON "AbdmCareContext"("clinicId");
CREATE INDEX IF NOT EXISTS "AbdmCareContext_patientId_idx" ON "AbdmCareContext"("patientId");
CREATE INDEX IF NOT EXISTS "AbdmCareContext_linkStatus_idx" ON "AbdmCareContext"("linkStatus");
CREATE UNIQUE INDEX IF NOT EXISTS "AbdmEvent_transactionId_kind_key" ON "AbdmEvent"("transactionId", "kind");
CREATE INDEX IF NOT EXISTS "AbdmEvent_clinicId_idx" ON "AbdmEvent"("clinicId");
CREATE INDEX IF NOT EXISTS "AbdmEvent_kind_idx" ON "AbdmEvent"("kind");

DO $$ BEGIN
 ALTER TABLE "AbdmConsent" ADD CONSTRAINT "AbdmConsent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "AbdmConsent" ADD CONSTRAINT "AbdmConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "AbdmCareContext" ADD CONSTRAINT "AbdmCareContext_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "AbdmCareContext" ADD CONSTRAINT "AbdmCareContext_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "AbdmEvent" ADD CONSTRAINT "AbdmEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
