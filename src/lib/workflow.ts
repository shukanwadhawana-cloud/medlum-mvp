export const APPOINTMENT_STATUSES = [
  "Scheduled",
  "Confirmed",
  "Waiting",
  "In Consultation",
  "Completed",
  "Cancelled",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  Scheduled: ["Confirmed", "Waiting", "Cancelled"],
  Confirmed: ["Waiting", "Cancelled"],
  // Direct completion remains supported for the existing one-click OPD workflow;
  // video/clinical sessions can use the explicit In Consultation state first.
  Waiting: ["In Consultation", "Completed", "Cancelled"],
  "In Consultation": ["Completed"],
  Completed: [],
  Cancelled: [],
};

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return (APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

export function canTransitionAppointment(from: string, to: string): boolean {
  if (!isAppointmentStatus(from) || !isAppointmentStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

export function appointmentTransitionError(from: string, to: string): string | null {
  if (!isAppointmentStatus(to)) return `Invalid appointment status: ${to}`;
  if (!isAppointmentStatus(from)) return `Invalid current appointment status: ${from}`;
  if (canTransitionAppointment(from, to)) return null;
  return `Cannot change appointment from ${from} to ${to}.`;
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
