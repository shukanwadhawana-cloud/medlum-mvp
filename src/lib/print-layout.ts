/**
 * Shared patient-facing print layout helpers.
 * Hospital letterhead is primary; MedLum is never the document identity.
 */

export type PrintClinic = {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  registrationNo?: string | null;
  letterheadHeightMm?: number | null;
  showMedlumFooter?: boolean | null;
  invoiceFooter?: string | null;
};

export const DEFAULT_LETTERHEAD_MM = 40;

export function letterheadHeightMm(clinic?: PrintClinic | null): number {
  const n = clinic?.letterheadHeightMm;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 120) return n;
  return DEFAULT_LETTERHEAD_MM;
}

export function showMedlumFooter(clinic?: PrintClinic | null): boolean {
  return clinic?.showMedlumFooter !== false;
}

/** CSS height for reserved pre-printed letterhead band. */
export function letterheadStyle(clinic?: PrintClinic | null): { height: string; minHeight: string } {
  const mm = letterheadHeightMm(clinic);
  return { height: `${mm}mm`, minHeight: `${mm}mm` };
}

/** Financial field names that must not appear on clinical printouts. */
export const CLINICAL_PRINT_FORBIDDEN_FINANCE = [
  "amount paid",
  "invoice total",
  "payment method",
  "balance due",
  "balance",
  "paid",
  "₹",
] as const;
