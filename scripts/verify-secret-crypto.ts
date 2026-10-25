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

  // Adding a dedicated key later must not make values encrypted under SESSION_SECRET unreadable.
  process.env.MEDLUM_TELEGRAM_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  assert.equal(decryptSecret(sessionCiphertext), plaintext, "a dedicated key upgrade must preserve access to SESSION_SECRET-encrypted values");
  const dedicatedCiphertext = encryptSecret(plaintext);
  assert.equal(decryptSecret(dedicatedCiphertext), plaintext, "new values should round-trip with the dedicated 32-byte key");

  delete process.env.MEDLUM_TELEGRAM_ENCRYPTION_KEY;
  delete process.env.SESSION_SECRET;
  process.env.NEXTAUTH_SECRET = "synthetic-legacy-nextauth-secret-for-crypto-test-2026-32chars";
  const legacyCiphertext = encryptSecret(plaintext);
  assert.equal(decryptSecret(legacyCiphertext), plaintext, "legacy NEXTAUTH_SECRET fallback must remain compatible");

  process.env.SESSION_SECRET = "synthetic-session-secret-for-crypto-test-2026-32chars";
  assert.equal(decryptSecret(legacyCiphertext), plaintext, "adding another fallback candidate must not break legacy decryption");

  console.log("Telegram secret encryption tests passed: dedicated key, legacy fallback compatibility, session-secret fallback, key-upgrade compatibility, and round-trip encryption.");
} finally {
  restore("MEDLUM_TELEGRAM_ENCRYPTION_KEY", original.dedicated);
  restore("NEXTAUTH_SECRET", original.nextAuth);
  restore("SESSION_SECRET", original.session);
}
