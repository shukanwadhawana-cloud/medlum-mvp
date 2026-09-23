ALTER TABLE "FacilityTelegramIntegration"
  ADD COLUMN "connectionCodeHash" TEXT,
  ADD COLUMN "connectionExpiresAt" TIMESTAMP(3);

CREATE INDEX "FacilityTelegramIntegration_connectionExpiresAt_idx"
  ON "FacilityTelegramIntegration"("connectionExpiresAt");
