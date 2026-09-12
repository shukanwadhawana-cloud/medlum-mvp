-- MedLum Phase 9B: provider-neutral telemedicine session foundation.
-- No video vendor or media storage is introduced here.

CREATE TABLE "TelemedicineSession" (
  "id" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "appointmentId" TEXT,
  "clinicId" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'Scheduled',
  "provider" TEXT NOT NULL DEFAULT 'external',
  "meetingUrl" TEXT,
  "joinTokenHash" TEXT,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TelemedicineSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelemedicineSession_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TelemedicineSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TelemedicineSession_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TelemedicineSession_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TelemedicineSession_joinTokenHash_key" ON "TelemedicineSession"("joinTokenHash");
CREATE INDEX "TelemedicineSession_doctorId_scheduledAt_idx" ON "TelemedicineSession"("doctorId", "scheduledAt");
CREATE INDEX "TelemedicineSession_patientId_scheduledAt_idx" ON "TelemedicineSession"("patientId", "scheduledAt");
CREATE INDEX "TelemedicineSession_appointmentId_idx" ON "TelemedicineSession"("appointmentId");
CREATE INDEX "TelemedicineSession_clinicId_idx" ON "TelemedicineSession"("clinicId");
CREATE INDEX "TelemedicineSession_status_scheduledAt_idx" ON "TelemedicineSession"("status", "scheduledAt");
