/**
 * Phone normalization for lookup and storage hints.
 * India-aware defaults preserved; international numbers retained when clearly non-IN.
 */

import { getPlatformLocaleConfig } from "@/lib/locale";

/**
 * Normalize phone digits for portal / staff lookup.
 * - Indian numbers: collapse to 10-digit national form (existing behaviour).
 * - International: keep full digit string (E.164 without '+') when length > 11
 *   and not an obvious +91 / 0-prefix Indian variant.
 */
export function normalizePhoneDigits(input: string): string {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return "";

  const country = getPlatformLocaleConfig().country;

  // India-preserving path (default platform country IN)
  if (country === "IN" || digits.startsWith("91")) {
    // +91XXXXXXXXXX or 91XXXXXXXXXX → last 10 when national mobile length
    if (digits.length >= 12 && digits.startsWith("91")) {
      const national = digits.slice(2);
      if (national.length === 10) return national;
      // Longer than expected: keep full international digits
      return digits;
    }
    // 0XXXXXXXXXX → drop leading 0
    if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
    // Keep last 10 if longer than 10 and looks like IN mobile with extra prefix
    if (digits.length > 10 && digits.length <= 12) return digits.slice(-10);
    if (digits.length === 10) return digits;
  }

  // Non-India platform or clearly international length: keep full digits
  if (digits.length > 11) return digits;
  return digits;
}

/** Candidate strings to try when looking up a stored phone. */
export function phoneLookupCandidates(input: string): string[] {
  const raw = String(input || "").trim();
  const digits = normalizePhoneDigits(raw);
  const set = new Set<string>();
  if (raw) set.add(raw);
  if (digits) {
    set.add(digits);
    set.add(`+${digits}`);
    // India-compatible candidates (harmless for international lookups)
    if (digits.length === 10) {
      set.add(`+91${digits}`);
      set.add(`91${digits}`);
      set.add(`0${digits}`);
    }
  }
  return [...set];
}
