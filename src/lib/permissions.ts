/**
 * Central MedLum role → module permission mapping.
 * Pure functions — safe for client navigation AND server authorization.
 * Must NOT import next/headers, prisma, or other server-only modules
 * (AppShell is a client component).
 * Server-side clinic-auth + requireActiveClinicMembership remain authoritative.
 * Never trust client-supplied role/clinicId for security decisions.
 */
import type { ClinicRole } from "@/lib/workflow";
import { normalizeClinicRole } from "@/lib/workflow";

/** Application modules surfaced in navigation / gated by role. */
export type MedLumModule =
  | "dashboard"
  | "patients"
  | "opd"
  | "ipd"
  | "emergency"
  | "pharmacy"
  | "labs"
  | "diagnostics"
  | "prescriptions"
  | "nursing"
  | "telemedicine"
  | "workforce"
  | "duty"
  | "clinic"
  | "clinic_setup"
  | "tariffs"
  | "billing"
  | "reports"
  | "blood_bank"
  | "insurance"
  | "clinical_assist"
  | "owner_platform";

/** Roles that may access each module (facility ClinicMember.role). */
const MODULE_ROLES: Record<MedLumModule, readonly ClinicRole[]> = {
  dashboard: [
    "Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO",
    "Nurse", "Pharmacy", "Laboratory", "Billing", "Receptionist", "Staff",
  ],
  patients: [
    "Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO",
    "Nurse", "Pharmacy", "Laboratory", "Billing", "Receptionist",
  ],
  opd: ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Receptionist"],
  ipd: ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Nurse", "Pharmacy", "Laboratory"],
  emergency: ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Nurse"],
  pharmacy: ["Owner", "Admin", "Manager", "Pharmacy"],
  labs: ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Laboratory"],
  diagnostics: ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Laboratory"],
  prescriptions: ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Pharmacy"],
  nursing: ["Owner", "Admin", "Manager", "Nurse", "RMO"],
  telemedicine: ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO"],
  workforce: ["Owner", "Admin", "Manager"],
  duty: ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Nurse", "Pharmacy", "Laboratory", "Billing", "Receptionist", "Staff"],
  clinic: ["Owner", "Admin", "Manager"],
  clinic_setup: ["Owner", "Admin"],
  tariffs: ["Owner", "Admin", "Manager"],
  // Billing detail restricted: Owner, Admin, Receptionist, Billing only (no Manager/clinical).
  billing: ["Owner", "Admin", "Receptionist", "Billing"],
  reports: ["Owner", "Admin", "Manager"],
  blood_bank: ["Owner", "Admin", "Manager", "Nurse", "Laboratory"],
  insurance: ["Owner", "Admin", "Manager", "Billing"],
  clinical_assist: ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO"],
  // Platform MedLum owner only — never granted via facility Admin membership alone.
  owner_platform: [],
};

/** Path prefix → module mapping for navigation filtering. */
export const PATH_MODULE: Record<string, MedLumModule> = {
  "/dashboard": "dashboard",
  "/patients": "patients",
  "/opd": "opd",
  "/appointments": "opd",
  "/ipd": "ipd",
  "/ipd-summaries": "ipd",
  "/emergency": "emergency",
  "/pharmacy": "pharmacy",
  "/labs": "labs",
  "/diagnostics": "diagnostics",
  "/prescriptions": "prescriptions",
  "/nursing": "nursing",
  "/telemedicine": "telemedicine",
  "/workforce": "workforce",
  "/people": "workforce",
  "/duty": "duty",
  "/clinic": "clinic",
  "/clinic/setup": "clinic_setup",
  "/clinic/tariffs": "tariffs",
  "/billing": "billing",
  "/reports": "reports",
  "/blood-bank": "blood_bank",
  "/insurance": "insurance",
  "/clinical-assist": "clinical_assist",
  "/owner": "owner_platform",
};

export function canAccessModule(role: string | null | undefined, module: MedLumModule): boolean {
  const normalized = normalizeClinicRole(role || "");
  return MODULE_ROLES[module].includes(normalized);
}

export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  if (PATH_MODULE[path]) return canAccessModule(role, PATH_MODULE[path]);
  const match = Object.keys(PATH_MODULE)
    .filter((p) => p !== "/" && path.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)[0];
  if (match) return canAccessModule(role, PATH_MODULE[match]);
  return true;
}

export function canManageStaff(role: string | null | undefined): boolean {
  const r = normalizeClinicRole(role || "");
  return r === "Owner" || r === "Admin" || r === "Manager";
}

export function canManageClinic(role: string | null | undefined): boolean {
  const r = normalizeClinicRole(role || "");
  return r === "Owner" || r === "Admin";
}

export function canPrescribe(role: string | null | undefined): boolean {
  const r = normalizeClinicRole(role || "");
  return r === "Owner" || r === "Admin" || r === "Manager" || r === "Consultant" || r === "Doctor" || r === "RMO";
}

export function canDispense(role: string | null | undefined): boolean {
  const r = normalizeClinicRole(role || "");
  return r === "Owner" || r === "Admin" || r === "Manager" || r === "Pharmacy";
}

export function canEnterLabResult(role: string | null | undefined): boolean {
  const r = normalizeClinicRole(role || "");
  return r === "Owner" || r === "Admin" || r === "Manager" || r === "Laboratory";
}

export function canEnterDiagnosticReport(role: string | null | undefined): boolean {
  const r = normalizeClinicRole(role || "");
  return r === "Owner" || r === "Admin" || r === "Manager" || r === "Laboratory" || r === "Consultant" || r === "Doctor";
}

export function canManageMAR(role: string | null | undefined): boolean {
  const r = normalizeClinicRole(role || "");
  return r === "Owner" || r === "Admin" || r === "Manager" || r === "Consultant" || r === "Doctor" || r === "RMO" || r === "Nurse";
}

export function canViewClinicalChart(role: string | null | undefined): boolean {
  const r = normalizeClinicRole(role || "");
  return (
    r === "Owner" ||
    r === "Admin" ||
    r === "Manager" ||
    r === "Consultant" ||
    r === "Doctor" ||
    r === "RMO" ||
    r === "Nurse"
  );
}

export function canOrderLabs(role: string | null | undefined): boolean {
  const r = normalizeClinicRole(role || "");
  return r === "Owner" || r === "Admin" || r === "Manager" || r === "Consultant" || r === "Doctor" || r === "RMO";
}

export function canViewBilling(role: string | null | undefined): boolean {
  return canAccessModule(role, "billing");
}

export function canAccessClinicalAssist(role: string | null | undefined): boolean {
  return canAccessModule(role, "clinical_assist");
}

/** Default landing path for a facility role (post-login redirect). */
export function defaultLandingPath(role: string | null | undefined): string {
  const r = normalizeClinicRole(role || "");
  if (r === "Pharmacy") return "/pharmacy";
  if (r === "Laboratory") return "/labs";
  if (r === "Nurse") return "/nursing";
  if (r === "Billing") return "/billing";
  if (r === "Receptionist") return "/opd";
  if (canAccessModule(r, "opd")) return "/opd";
  if (canAccessModule(r, "patients")) return "/patients";
  return "/dashboard";
}

/** Primary nav items for a role (ordered, mobile-first). */
export type NavItem = { href: string; label: string; icon: string; module: MedLumModule };

const ALL_PRIMARY: NavItem[] = [
  { href: "/people", label: "People", icon: "people", module: "workforce" },
  { href: "/opd", label: "OPD", icon: "clinic", module: "opd" },
  { href: "/patients", label: "Patients", icon: "patients", module: "patients" },
  { href: "/clinical-assist", label: "AI Assist", icon: "ai", module: "clinical_assist" },
  { href: "/ipd", label: "IPD", icon: "ipd", module: "ipd" },
  { href: "/emergency", label: "Emergency", icon: "emergency", module: "emergency" },
  { href: "/nursing", label: "Nursing", icon: "patients", module: "nursing" },
  { href: "/labs", label: "Labs", icon: "labs", module: "labs" },
  { href: "/diagnostics", label: "Diagnostics", icon: "diagnostics", module: "diagnostics" },
  { href: "/pharmacy", label: "Pharmacy", icon: "pharmacy", module: "pharmacy" },
  { href: "/prescriptions", label: "Prescriptions", icon: "rx", module: "prescriptions" },
  { href: "/telemedicine", label: "Video", icon: "video", module: "telemedicine" },
  { href: "/billing", label: "Billing", icon: "billing", module: "billing" },
];

const ALL_MENU: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "clinic", module: "dashboard" },
  { href: "/opd", label: "OPD", icon: "clinic", module: "opd" },
  { href: "/patients", label: "Patients", icon: "patients", module: "patients" },
  { href: "/ipd", label: "IPD", icon: "ipd", module: "ipd" },
  { href: "/emergency", label: "Emergency", icon: "emergency", module: "emergency" },
  { href: "/nursing", label: "Nursing", icon: "patients", module: "nursing" },
  { href: "/labs", label: "Laboratory", icon: "labs", module: "labs" },
  { href: "/diagnostics", label: "Diagnostics", icon: "diagnostics", module: "diagnostics" },
  { href: "/pharmacy", label: "Pharmacy", icon: "pharmacy", module: "pharmacy" },
  { href: "/prescriptions", label: "Prescriptions", icon: "rx", module: "prescriptions" },
  { href: "/telemedicine", label: "Telemedicine", icon: "video", module: "telemedicine" },
  { href: "/appointments", label: "Appointments", icon: "clinic", module: "opd" },
  { href: "/duty", label: "Duty", icon: "duty", module: "duty" },
  { href: "/people", label: "People / HRIS", icon: "people", module: "workforce" },
  { href: "/workforce", label: "Staff & Workforce", icon: "people", module: "workforce" },
  { href: "/clinic", label: "Staff & Clinic settings", icon: "clinic", module: "clinic" },
  { href: "/clinic/setup", label: "Hospital / Clinic setup", icon: "clinic", module: "clinic_setup" },
  { href: "/clinic/tariffs", label: "Tariff / Rate list", icon: "billing", module: "tariffs" },
  { href: "/billing", label: "Patient billing", icon: "billing", module: "billing" },
  { href: "/ipd-summaries", label: "IPD summaries", icon: "ipd", module: "ipd" },
  { href: "/blood-bank", label: "Blood bank", icon: "blood", module: "blood_bank" },
  { href: "/insurance", label: "Insurance", icon: "insurance", module: "insurance" },
  { href: "/reports", label: "Reports", icon: "reports", module: "reports" },
  { href: "/clinical-assist", label: "AI Assist", icon: "ai", module: "clinical_assist" },
];

export function primaryNavForRole(role: string | null | undefined): NavItem[] {
  return ALL_PRIMARY.filter((item) => canAccessModule(role, item.module));
}

export function menuNavForRole(role: string | null | undefined): NavItem[] {
  return ALL_MENU.filter((item) => canAccessModule(role, item.module));
}

export { MODULE_ROLES };
