import crypto from "node:crypto";

function key(): Buffer {
  const raw = String(process.env.MEDLUM_TELEGRAM_ENCRYPTION_KEY || "");
  if (!raw) throw new Error("MEDLUM_TELEGRAM_ENCRYPTION_KEY is not configured");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  const hex = Buffer.from(raw, "hex");
  if (hex.length === 32) return hex;
  throw new Error("MEDLUM_TELEGRAM_ENCRYPTION_KEY must decode to exactly 32 bytes");
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}