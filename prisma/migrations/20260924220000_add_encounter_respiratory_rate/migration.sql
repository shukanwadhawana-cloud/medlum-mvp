-- Add respiratory rate to OPD encounters so the patient cover sheet and clinical record
-- can reflect BP, pulse, SpO₂, RR, and allergy consistently.
ALTER TABLE "Encounter" ADD COLUMN IF NOT EXISTS "rr" TEXT NOT NULL DEFAULT '';
