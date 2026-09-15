/** Shared SESSION_SECRET resolution — fail closed in production. */

const WEAK_SECRETS = new Set([
  "change-me-to-a-long-random-secret-at-least-32-chars",
  "medlum-dev-secret-change-me-32b",
  "changemechangemechangemechangeme",
]);

export function resolveSessionSecretBytes(): Uint8Array {
  const secret = process.env.SESSION_SECRET || "";
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!secret || secret.length < 32) {
      throw new Error("SESSION_SECRET must be configured with at least 32 characters");
    }
    if (WEAK_SECRETS.has(secret) || /^[0]+$/.test(secret) || /^[a]+$/i.test(secret)) {
      throw new Error("SESSION_SECRET must be configured with at least 32 characters");
    }
    return new TextEncoder().encode(secret);
  }

  if (secret && secret.length >= 32) {
    return new TextEncoder().encode(secret);
  }

  // Development-only fallback — never used when NODE_ENV=production.
  return new TextEncoder().encode("medlum-dev-secret-change-me-32b");
}
