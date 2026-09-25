/**
 * CPRS-style inpatient medication order helpers (Global Vista / Max pattern).
 * Horizontal order row: name · dose · route · schedule · PRN · duration · priority · comment
 */

export const MED_ROUTES = [
  "ORAL",
  "INTRAVENOUS",
  "INTRAMUSCULAR",
  "SUBCUTANEOUS",
  "TOPICAL",
  "INHALATION",
  "RECTAL",
  "SUBLINGUAL",
  "NASAL",
  "OTHER",
] as const;

/** Common hospital schedule codes (inspired by Vista CPRS) */
export const MED_SCHEDULES = [
  "STAT(ONE TIME ONLY)",
  "ONCE(ONE TIME ONLY)",
  "NOW",
  "CONTINUOUS",
  "Q1H(EVERY 1 HRS)",
  "Q2H(EVERY 2 HRS)",
  "Q3H(EVERY 3 HRS)",
  "Q4H(EVERY 4 HRS)",
  "Q6H(6,12,18&24HRS)",
  "Q8H(6,14&22 HRS)",
  "Q12H(6,18HRS)",
  "BID(08&20HRS)",
  "BID(10&22HRS)",
  "TID(6,14&22HRS)",
  "QID(6,12,18&24HRS)",
  "OD / DAILY",
  "QHS(DAILY 22:00)",
  "QAM(06HRS)",
  "PRN",
] as const;

export const MED_PRIORITIES = ["ROUTINE", "STAT"] as const;

export const MED_DURATION_UNITS = ["days", "weeks", "months"] as const;

/** Reasons when discontinuing / cancelling a medication order (double-sign context) */
export const DISCONTINUE_REASONS = [
  "Duplicate Order",
  "Requesting Physician Cancelled",
  "Obsolete Order",
  "Entered in error",
  "Patient Request",
] as const;

export type MedOrderLine = {
  medicineName: string;
  dosage: string;
  route: string;
  schedule: string;
  prn: boolean;
  durationValue: number;
  durationUnit: string;
  priority: string;
  additionalDoseNow: boolean;
  comment: string;
};

export function emptyMedOrderLine(name = ""): MedOrderLine {
  return {
    medicineName: name,
    dosage: "",
    route: "ORAL",
    schedule: "OD / DAILY",
    prn: false,
    durationValue: 0,
    durationUnit: "days",
    priority: "ROUTINE",
    additionalDoseNow: false,
    comment: "",
  };
}

/** Serialize line to prescription medicines text blob (backward compatible) */
export function formatMedOrderLine(line: MedOrderLine): string {
  const bits = [
    line.medicineName.trim(),
    line.dosage.trim(),
    line.route,
    line.schedule,
    line.prn ? "PRN" : null,
    line.durationValue > 0 ? `x${line.durationValue}${line.durationUnit}` : null,
    line.priority === "STAT" ? "STAT" : null,
    line.comment.trim() ? `(${line.comment.trim()})` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

/** Progress-note section toggles (CPRS progress note checkboxes) */
export const PROGRESS_NOTE_SECTIONS = [
  "Vitals",
  "Allergies",
  "Problems",
  "Diagnosis",
  "Complaints",
  "Medications",
  "Laboratory",
  "Radiology",
  "Clinical Notes",
  "Orders",
] as const;

export const PROGRESS_NOTE_FIELDS = [
  { key: "assessment", label: "Assessment / Review of Systems" },
  { key: "currentMedications", label: "Current Medications" },
  { key: "advicePlan", label: "Advice / Plan of Care" },
  { key: "courseInHospital", label: "Course in Hospital" },
  { key: "advice", label: "Advice" },
] as const;
