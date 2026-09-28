export const APPOINTMENT_STATUSES = [
  "Scheduled",
  "Confirmed",
  "Waiting",
  "In Consultation",
  "Completed",
  "Cancelled",
  "No Show",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Accept commercial aliases used in product docs while storing canonical labels. */
const STATUS_ALIASES: Record<string, AppointmentStatus> = {
  SCHEDULED: "Scheduled",
  Scheduled: "Scheduled",
  CONFIRMED: "Confirmed",
  Confirmed: "Confirmed",
  CHECKED_IN: "Waiting",
  "Checked In": "Waiting",
  "Checked-In": "Waiting",
  Waiting: "Waiting",
  IN_CONSULTATION: "In Consultation",
  "In Consultation": "In Consultation",
  COMPLETED: "Completed",
  Completed: "Completed",
  CANCELLED: "Cancelled",
  Cancelled: "Cancelled",
  Canceled: "Cancelled",
  NO_SHOW: "No Show",
  "No Show": "No Show",
  "No-Show": "No Show",
};

export function normalizeAppointmentStatus(value: string): AppointmentStatus | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if ((APPOINTMENT_STATUSES as readonly string[]).includes(raw)) return raw as AppointmentStatus;
  const mapped = STATUS_ALIASES[raw] || STATUS_ALIASES[raw.toUpperCase()] || STATUS_ALIASES[raw.replace(/_/g, " ")];
  return mapped || null;
}

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  Scheduled: ["Confirmed", "Waiting", "Cancelled", "No Show"],
  Confirmed: ["Waiting", "Cancelled", "No Show"],
  // Direct completion remains supported for the existing one-click OPD workflow;
  // video/clinical sessions can use the explicit In Consultation state first.
  Waiting: ["In Consultation", "Completed", "Cancelled", "No Show"],
  "In Consultation": ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: [],
  "No Show": [],
};

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return normalizeAppointmentStatus(value) !== null;
}

export function canTransitionAppointment(from: string, to: string): boolean {
  const f = normalizeAppointmentStatus(from);
  const t = normalizeAppointmentStatus(to);
  if (!f || !t) return false;
  return TRANSITIONS[f].includes(t);
}

export function appointmentTransitionError(from: string, to: string): string | null {
  const f = normalizeAppointmentStatus(from);
  const t = normalizeAppointmentStatus(to);
  if (!t) return `Invalid appointment status: ${to}`;
  if (!f) return `Invalid current appointment status: ${from}`;
  if (canTransitionAppointment(f, t)) return null;
  return `Cannot change appointment from ${f} to ${t}.`;
}

export const CLINIC_ROLES = [
  "Owner",
  "Admin",
  "Manager",
  "Consultant",
  "Doctor",
  "RMO",
  "Nurse",
  "Pharmacy",
  "Laboratory",
  "Billing",
  "Receptionist",
  "Staff",
] as const;
export type ClinicRole = (typeof CLINIC_ROLES)[number];

const ROLE_ALIASES: Record<string, ClinicRole> = {
  Owner: "Owner",
  Admin: "Admin",
  Manager: "Manager",
  Consultant: "Consultant",
  Doctor: "Doctor",
  RMO: "RMO",
  Nurse: "Nurse",
  Pharmacy: "Pharmacy",
  Laboratory: "Laboratory",
  Billing: "Billing",
  Receptionist: "Receptionist",
  Staff: "Staff",
  // legacy / informal aliases
  MasterOwner: "Owner",
  "Lab Tech": "Laboratory",
  Lab: "Laboratory",
  Pharmacist: "Pharmacy",
};

export function normalizeClinicRole(role: string | null | undefined): ClinicRole {
  if (!role) return "Consultant";
  const mapped = ROLE_ALIASES[role] || ROLE_ALIASES[role.trim()];
  if (mapped) return mapped;
  return "Consultant";
}

export const ROLE_PERMISSIONS: Record<ClinicRole, readonly string[]> = {
  Owner: ["clinical", "appointments", "telemedicine", "billing", "clinic_admin", "inventory", "lab", "pharmacy", "tariff", "staff_admin", "audit"],
  Admin: ["clinical", "appointments", "telemedicine", "billing", "clinic_admin", "inventory", "lab", "pharmacy", "tariff", "staff_admin", "audit"],
  Manager: ["clinical", "appointments", "telemedicine", "billing", "clinic_admin", "inventory", "lab", "pharmacy", "tariff", "staff_admin"],
  Consultant: ["clinical", "appointments", "telemedicine", "lab"],
  Doctor: ["clinical", "appointments", "telemedicine", "lab"],
  RMO: ["clinical", "appointments", "lab"],
  Nurse: ["appointments", "clinical_assist"],
  Pharmacy: ["pharmacy", "inventory"],
  Laboratory: ["lab"],
  Billing: ["billing"],
  Receptionist: ["appointments", "billing"],
  Staff: ["appointments"],
};

export function roleCan(role: string | null | undefined, permission: string): boolean {
  return ROLE_PERMISSIONS[normalizeClinicRole(role)].includes(permission);
}
