#!/usr/bin/env node
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret } from "../src/lib/secret-crypto";

const original = {
  dedicated: process.env.MEDLUM_TELEGRAM_ENCRYPTION_KEY,
  nextAuth: process.env.NEXTAUTH_SECRET,
  session: process.env.SESSION_SECRET,
};
const restore = (key: string, value: string | undefined): void => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

try {
  const plaintext = "synthetic-telegram-token-never-real";

  delete process.env.MEDLUM_TELEGRAM_ENCRYPTION_KEY;
  delete process.env.NEXTAUTH_SECRET;
  process.env.SESSION_SECRET = "synthetic-session-secret-for-crypto-test-2026-32chars";
  const sessionCiphertext = encryptSecret(plaintext);
  assert.notEqual(sessionCiphertext, plaintext, "token must not be stored in plaintext");
  assert.equal(decryptSecret(sessionCiphertext), plaintext, "configured SESSION_SECRET fallback must encrypt and decrypt");

  delete process.env.SESSION_SECRET;
  process.env.NEXTAUTH_SECRET = "synthetic-legacy-nextauth-secret-for-crypto-test-2026-32chars";
  const legacyCiphertext = encryptSecret(plaintext);
  assert.equal(decryptSecret(legacyCiphertext), plaintext, "legacy NEXTAUTH_SECRET fallback must remain compatible");

  delete process.env.NEXTAUTH_SECRET;
  process.env.MEDLUM_TELEGRAM_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const dedicatedCiphertext = encryptSecret(plaintext);
  assert.equal(decryptSecret(dedicatedCiphertext), plaintext, "dedicated 32-byte key must continue to work");

  console.log("Telegram secret encryption tests passed: dedicated key, NEXTAUTH_SECRET compatibility, SESSION_SECRET fallback, and round-trip encryption.");
} finally {
  restore("MEDLUM_TELEGRAM_ENCRYPTION_KEY", original.dedicated);
  restore("NEXTAUTH_SECRET", original.nextAuth);
  restore("SESSION_SECRET", original.session);
}
