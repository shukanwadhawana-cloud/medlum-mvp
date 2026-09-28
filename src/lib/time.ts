/**
 * Clinical date/time helpers.
 * Platform timezone defaults to Asia/Kolkata (existing India behaviour)
 * and can be overridden via MEDLUM_DEFAULT_TIMEZONE without a schema migration.
 */
import { getClinicalTimezone, getPlatformLocaleConfig } from "@/lib/locale";

/** @deprecated Prefer getClinicalTimezone() — kept for existing imports. */
export const CLINICAL_TIMEZONE = "Asia/Kolkata";

export function nowUtc(): Date {
  return new Date();
}

/** Format a Date/ISO string for clinical display in the platform clinical timezone. */
export function formatClinical(
  input?: Date | string | null,
  opts?: { withSeconds?: boolean; dateOnly?: boolean; timezone?: string }
): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
  const cfg = getPlatformLocaleConfig();
  const timeZone = opts?.timezone || getClinicalTimezone();
  if (opts?.dateOnly) {
    return new Intl.DateTimeFormat(cfg.locale, {
      timeZone,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  }
  const formatted = new Intl.DateTimeFormat(cfg.locale, {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(opts?.withSeconds ? { second: "2-digit" as const } : {}),
    hour12: false,
  }).format(d);
  // Preserve historical "IST" suffix when the active zone is Asia/Kolkata
  const suffix = timeZone === "Asia/Kolkata" ? " IST" : "";
  return formatted + suffix;
}

/** Backward-compatible alias — same behaviour as formatClinical with platform defaults. */
export function formatIst(
  input?: Date | string | null,
  opts?: { withSeconds?: boolean; dateOnly?: boolean }
): string {
  return formatClinical(input, opts);
}

/** ISO-like local wall clock for audit meta (not for storage of primary timestamps). */
export function clinicalIsoLabel(input?: Date | string | null): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const timeZone = getClinicalTimezone();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  // Historical IST offset label when zone is Kolkata; otherwise omit fixed offset
  const offset = timeZone === "Asia/Kolkata" ? "+05:30" : "";
  const base = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
  return offset ? `${base}${offset}` : base;
}

/** @deprecated Prefer clinicalIsoLabel */
export function istIsoLabel(input?: Date | string | null): string {
  return clinicalIsoLabel(input);
}
