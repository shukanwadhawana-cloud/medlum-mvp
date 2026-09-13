-- Peer (consultant-to-consultant) video: patient is optional.
-- Also safe if foundation migration already applied.

ALTER TABLE "TelemedicineSession" ALTER COLUMN "patientId" DROP NOT NULL;

ALTER TABLE "TelemedicineSession" ADD COLUMN IF NOT EXISTS "sessionKind" TEXT NOT NULL DEFAULT 'patient';
ALTER TABLE "TelemedicineSession" ADD COLUMN IF NOT EXISTS "peerLabel" TEXT;
