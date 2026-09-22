/** Canonical clinical timezone for MedLum: Asia/Kolkata (IST, UTC+5:30). */

export const CLINICAL_TIMEZONE = "Asia/Kolkata";

export function nowUtc(): Date {
  return new Date();
}

/** Format a Date/ISO string for clinical display in IST. */
export function formatIst(
  input?: Date | string | null,
  opts?: { withSeconds?: boolean; dateOnly?: boolean }
): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
  if (opts?.dateOnly) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: CLINICAL_TIMEZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  }
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone: CLINICAL_TIMEZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      ...(opts?.withSeconds ? { second: "2-digit" as const } : {}),
      hour12: false,
    }).format(d) + " IST"
  );
}

/** ISO-like local IST wall clock for audit meta (not for storage of primary timestamps). */
export function istIsoLabel(input?: Date | string | null): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINICAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+05:30`;
}
