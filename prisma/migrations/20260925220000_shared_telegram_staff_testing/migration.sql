-- Allow one Telegram account/chat to be linked to multiple MedLum test/staff accounts.
-- Login still requires the individual MedLum email + password, then sends the OTP to the linked Telegram chat.
DROP INDEX IF EXISTS "TelegramIdentity_telegramUserId_key";
DROP INDEX IF EXISTS "TelegramIdentity_telegramChatId_key";
CREATE INDEX IF NOT EXISTS "TelegramIdentity_telegramUserId_idx" ON "TelegramIdentity"("telegramUserId");
CREATE INDEX IF NOT EXISTS "TelegramIdentity_telegramChatId_idx" ON "TelegramIdentity"("telegramChatId");
