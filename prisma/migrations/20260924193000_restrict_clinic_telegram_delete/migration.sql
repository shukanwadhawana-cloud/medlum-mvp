-- Preserve facility Telegram integration records from clinic cascade deletion.
ALTER TABLE "FacilityTelegramIntegration"
  DROP CONSTRAINT IF EXISTS "FacilityTelegramIntegration_clinicId_fkey";

ALTER TABLE "FacilityTelegramIntegration"
  ADD CONSTRAINT "FacilityTelegramIntegration_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
