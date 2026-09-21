-- Align EmergencyCase table with Prisma schema (safe for existing deployments)

CREATE TABLE IF NOT EXISTS "EmergencyCase" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT,
    "doctorId" TEXT NOT NULL,
    "arrivalMode" TEXT NOT NULL DEFAULT 'Walk-in',
    "ambulanceProvider" TEXT NOT NULL DEFAULT '',
    "ambulanceNumber" TEXT NOT NULL DEFAULT '',
    "arrivalTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triageLevel" TEXT NOT NULL DEFAULT 'Urgent',
    "chiefComplaint" TEXT NOT NULL DEFAULT '',
    "vitals" TEXT NOT NULL DEFAULT '{}',
    "allergies" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "disposition" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmergencyCase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmergencyCase_clinicId_idx" ON "EmergencyCase"("clinicId");
CREATE INDEX IF NOT EXISTS "EmergencyCase_patientId_idx" ON "EmergencyCase"("patientId");
CREATE INDEX IF NOT EXISTS "EmergencyCase_doctorId_idx" ON "EmergencyCase"("doctorId");
CREATE INDEX IF NOT EXISTS "EmergencyCase_status_idx" ON "EmergencyCase"("status");
CREATE INDEX IF NOT EXISTS "EmergencyCase_arrivalTime_idx" ON "EmergencyCase"("arrivalTime");

DO $$ BEGIN
 ALTER TABLE "EmergencyCase" ADD CONSTRAINT "EmergencyCase_clinicId_fkey"
   FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
