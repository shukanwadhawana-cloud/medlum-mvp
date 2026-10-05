/**
 * MedLum platform owner recognition.
 *
 * Owner identity is declared ONLY via MEDLUM_OWNER_EMAIL (comma-separated).
 * There is no hardcoded fallback email — production must set the env var.
 * Clinic admins cannot elevate accounts to platform owner by changing emails:
 * isMedlumOwnerEmail is evaluated server-side from env, not from mutable DB fields.
 *
 * Bootstrap: when MEDLUM_OWNER_EMAIL is unset, no account is treated as platform owner
 * (fail-closed). Set MEDLUM_OWNER_EMAIL during first deploy to grant founder access.
 */

export function ownerEmailList(): string[] {
  return String(process.env.MEDLUM_OWNER_EMAIL || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isMedlumOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = ownerEmailList();
  if (!list.length) return false;
  return list.includes(String(email).toLowerCase().trim());
}

/** True when at least one platform owner email is configured. */
export function isPlatformOwnerConfigured(): boolean {
  return ownerEmailList().length > 0;
}
