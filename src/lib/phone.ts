/** Normalize phone numbers for portal account lookup (digits only, India-aware). */

export function normalizePhoneDigits(input: string): string {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return "";
  // +91XXXXXXXXXX or 91XXXXXXXXXX → last 10
  if (digits.length >= 12 && digits.startsWith("91")) return digits.slice(-10);
  // 0XXXXXXXXXX → drop leading 0
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  // Keep last 10 if longer than 10 (country code variants)
  if (digits.length > 10) return digits.slice(-10);
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
    set.add(`+91${digits}`);
    set.add(`91${digits}`);
    set.add(`0${digits}`);
  }
  return [...set];
}
