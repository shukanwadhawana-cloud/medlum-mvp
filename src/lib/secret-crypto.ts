import crypto from "node:crypto";

/**
 * Candidate keys are ordered from preferred to legacy.
 * Encrypt with the first configured key, but try all candidates when decrypting
 * so adding a dedicated key later does not strand secrets encrypted via fallback.
 */
function keys(): Buffer[] {
  const candidates: Buffer[] = [];
  const raw = String(process.env.MEDLUM_TELEGRAM_ENCRYPTION_KEY || "");
  if (raw) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) candidates.push(decoded);
    else {
      const hex = Buffer.from(raw, "hex");
      if (hex.length === 32) candidates.push(hex);
      else throw new Error("MEDLUM_TELEGRAM_ENCRYPTION_KEY must decode to exactly 32 bytes");
    }
  }

  const nextAuth = String(process.env.NEXTAUTH_SECRET || "");
  if (nextAuth) candidates.push(crypto.createHash("sha256").update("medlum:telegram:" + nextAuth).digest());

  const session = String(process.env.SESSION_SECRET || "");
  if (session) candidates.push(crypto.createHash("sha256").update("medlum:telegram:" + session).digest());

  const unique = candidates.filter((candidate, i) => !candidates.slice(0, i).some(previous => previous.equals(candidate)));
  if (!unique.length) {
    throw new Error("Telegram encryption requires MEDLUM_TELEGRAM_ENCRYPTION_KEY, NEXTAUTH_SECRET, or SESSION_SECRET");
  }
  return unique;
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keys()[0], iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(value: string): string {
  const [ivB64, tagB64, dataB64] = String(value || "").split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid encrypted secret");

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  for (const candidate of keys()) {
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", candidate, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      // The ciphertext may have been encrypted with a previous configured fallback key.
    }
  }
  throw new Error("Unable to decrypt secret with the configured encryption keys");
}
