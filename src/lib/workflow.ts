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

export const CLINIC_ROLES = ["Owner", "Admin", "Consultant", "Staff"] as const;
export type ClinicRole = (typeof CLINIC_ROLES)[number];

export function normalizeClinicRole(role: string | null | undefined): ClinicRole {
  if (role === "Owner" || role === "Admin" || role === "Consultant" || role === "Staff") return role;
  return "Consultant";
}

export const ROLE_PERMISSIONS: Record<ClinicRole, readonly string[]> = {
  Owner: ["clinical", "appointments", "telemedicine", "billing", "clinic_admin", "inventory"],
  Admin: ["clinical", "appointments", "telemedicine", "billing", "clinic_admin", "inventory"],
  Consultant: ["clinical", "appointments", "telemedicine"],
  Staff: ["appointments", "billing", "inventory"],
};

export function roleCan(role: string | null | undefined, permission: string): boolean {
  return ROLE_PERMISSIONS[normalizeClinicRole(role)].includes(permission);
}
