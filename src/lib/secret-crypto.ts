import crypto from "node:crypto";

function key(): Buffer {
  const raw = String(process.env.MEDLUM_TELEGRAM_ENCRYPTION_KEY || "");
  if (!raw) {
    // Prefer the legacy key source first to preserve compatibility with values already encrypted under it.
    // SESSION_SECRET is the configured production session key; the separate context prefix keeps
    // this derived key distinct from the signing key for cryptographic domain separation.
    const fallback = String(process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET || "");
    if (fallback) return crypto.createHash("sha256").update("medlum:telegram:" + fallback).digest();
    throw new Error("Telegram encryption requires MEDLUM_TELEGRAM_ENCRYPTION_KEY, NEXTAUTH_SECRET, or SESSION_SECRET");
  }
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

export function decryptSecret(value: string): string {
  const [ivB64, tagB64, dataB64] = String(value || "").split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid encrypted secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
