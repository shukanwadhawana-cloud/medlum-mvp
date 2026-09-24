-- Separate clinical document type from the author's clinic role.
ALTER TABLE "ClinicalNote" ADD COLUMN "authorRole" TEXT NOT NULL DEFAULT 'Consultant';

-- Normalize legacy labels so document history no longer conflates author role with document type.
UPDATE "ClinicalNote"
SET "noteType" = CASE
  WHEN "noteType" IN ('Consultant Note', 'RMO Note', 'Nursing Assessment') THEN 'Progress Note'
  WHEN "noteType" = 'Discharge Summary' THEN 'Discharge Note'
  WHEN "noteType" = 'Other' THEN 'Progress Note'
  ELSE "noteType"
END;
-- Backfill the stored author role from the author's active clinic membership where available.
UPDATE "ClinicalNote" n
SET "authorRole" = COALESCE((
  SELECT cm."role" FROM "ClinicMember" cm
  WHERE cm."clinicId" = n."clinicId" AND cm."doctorId" = n."authorDoctorId"
  ORDER BY cm."isActive" DESC, cm."updatedAt" DESC
  LIMIT 1
), 'Consultant');
