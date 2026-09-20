-- Replace Gmail OTP delivery with Telegram identity/linking.
CREATE TABLE IF NOT EXISTS "TelegramIdentity" (
  "id" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "telegramChatId" TEXT NOT NULL,
  "telegramUsername" TEXT,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramIdentity_doctorId_key" ON "TelegramIdentity"("doctorId");
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramIdentity_telegramUserId_key" ON "TelegramIdentity"("telegramUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramIdentity_telegramChatId_key" ON "TelegramIdentity"("telegramChatId");
CREATE INDEX IF NOT EXISTS "TelegramIdentity_telegramUserId_idx" ON "TelegramIdentity"("telegramUserId");
CREATE INDEX IF NOT EXISTS "TelegramIdentity_telegramChatId_idx" ON "TelegramIdentity"("telegramChatId");
DO $$ BEGIN
  ALTER TABLE "TelegramIdentity" ADD CONSTRAINT "TelegramIdentity_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "TelegramLinkChallenge" (
  "id" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramLinkChallenge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramLinkChallenge_tokenHash_key" ON "TelegramLinkChallenge"("tokenHash");
CREATE INDEX IF NOT EXISTS "TelegramLinkChallenge_doctorId_consumedAt_idx" ON "TelegramLinkChallenge"("doctorId","consumedAt");
CREATE INDEX IF NOT EXISTS "TelegramLinkChallenge_expiresAt_idx" ON "TelegramLinkChallenge"("expiresAt");
DO $$ BEGIN
  ALTER TABLE "TelegramLinkChallenge" ADD CONSTRAINT "TelegramLinkChallenge_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
