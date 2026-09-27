CREATE TABLE "TelemedicineParticipant" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'Guest',
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "joinedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelemedicineParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelemedicineParticipant_tokenHash_key" ON "TelemedicineParticipant"("tokenHash");
CREATE INDEX "TelemedicineParticipant_sessionId_status_idx" ON "TelemedicineParticipant"("sessionId", "status");
CREATE INDEX "TelemedicineParticipant_sessionId_createdAt_idx" ON "TelemedicineParticipant"("sessionId", "createdAt");

ALTER TABLE "TelemedicineParticipant"
  ADD CONSTRAINT "TelemedicineParticipant_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "TelemedicineSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;