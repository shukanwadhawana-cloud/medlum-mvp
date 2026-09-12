-- Phase 9A: preserve records by deactivating accounts/clinic memberships instead of deleting them.

ALTER TABLE "Doctor" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Doctor" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
CREATE INDEX "Doctor_isActive_idx" ON "Doctor"("isActive");

ALTER TABLE "Clinic" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Clinic" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
CREATE INDEX "Clinic_isActive_idx" ON "Clinic"("isActive");

ALTER TABLE "ClinicMember" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ClinicMember" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
CREATE INDEX "ClinicMember_isActive_idx" ON "ClinicMember"("isActive");
