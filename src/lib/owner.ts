/** MedLum platform owner recognition (founder/CEO).
 *
 * Production accounts are still stored as Doctor rows (no separate user table on main).
 * Owner identity is declared via MEDLUM_OWNER_EMAIL (comma-separated).
 * When unset, the repository founder email is used as bootstrap so the CEO can log in.
 */

const BOOTSTRAP_OWNER_EMAILS = ["shukanwadhawana@gmail.com"];

export function ownerEmailList(): string[] {
  const fromEnv = String(process.env.MEDLUM_OWNER_EMAIL || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  return BOOTSTRAP_OWNER_EMAILS.map((e) => e.toLowerCase());
}

export function isMedlumOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmailList().includes(String(email).toLowerCase().trim());
}
