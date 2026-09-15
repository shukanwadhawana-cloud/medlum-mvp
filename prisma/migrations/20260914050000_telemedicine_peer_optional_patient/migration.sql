-- AlterTable
ALTER TABLE "TelemedicineSession" ALTER COLUMN "patientId" DROP NOT NULL;

-- AlterTable  
-- sessionKind and peerLabel may already exist on some deploys; keep migration idempotent-friendly via IF NOT EXISTS patterns where supported.
