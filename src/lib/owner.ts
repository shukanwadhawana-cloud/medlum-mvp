/** MedLum platform owner recognition (founder/CEO).
 *
 * Production accounts are still stored as Doctor rows (no separate user table on main).
 * Owner identity is declared via MEDLUM_OWNER_EMAIL (comma-separated).
 *
 * Production MUST set MEDLUM_OWNER_EMAIL. Bootstrap emails are allowed only outside
 * production so local/dev can still log in without env configuration.
 */

const BOOTSTRAP_OWNER_EMAILS = ["shukanwadhawana@gmail.com"];

export function ownerEmailList(): string[] {
  const fromEnv = String(process.env.MEDLUM_OWNER_EMAIL || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  // Fail-closed in production: never fall back to hardcoded bootstrap identity.
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    return [];
  }
  return BOOTSTRAP_OWNER_EMAILS.map((e) => e.toLowerCase());
}

export function isMedlumOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmailList().includes(String(email).toLowerCase().trim());
}
