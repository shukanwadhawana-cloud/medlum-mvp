CREATE TABLE "FacilityTelegramIntegration" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "botUsername" TEXT NOT NULL DEFAULT '',
  "encryptedToken" TEXT NOT NULL,
  "chatId" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'CONNECTED',
  "lastVerifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilityTelegramIntegration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FacilityTelegramIntegration_clinicId_key" ON "FacilityTelegramIntegration"("clinicId");
CREATE INDEX "FacilityTelegramIntegration_status_idx" ON "FacilityTelegramIntegration"("status");
ALTER TABLE "FacilityTelegramIntegration"
  ADD CONSTRAINT "FacilityTelegramIntegration_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;