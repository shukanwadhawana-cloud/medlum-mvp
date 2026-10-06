/**
 * Central MedLum role → module permission mapping.
 * Pure functions — safe for client navigation AND server authorization.
 * Must NOT import next/headers, prisma, or other server-only modules
 * (AppShell is a client component).
 */

export type MedLumModule =
  | "dashboard"
  | "opd"
  | "patients"
  | "ipd"
  | "emergency"
  | "nursing"
  | "labs"
  | "diagnostics"
  | "pharmacy"
  | "prescriptions"
  | "telemedicine"
  | "billing"
  | "reports"
  | "duty"
  | "workforce"
  | "clinic"
  | "clinic_setup"
  | "tariffs"
  | "blood_bank"
  | "insurance"
  | "clinical_assist"
  | "owner";

/** Roles that may access each module. Owner always inherits full access via canAccessModule. */
const MODULE_ROLES: Record<MedLumModule, string[]> = {
  dashboard: ["Owner", "Admin", "Manager", "Consultant", "Resident", "Nurse", "Laboratory", "Pharmacy", "Billing", "Receptionist"],
  opd: ["Owner", "Admin", "Manager", "Consultant", "Resident", "Receptionist", "Nurse"],
  patients: ["Owner", "Admin", "Manager", "Consultant", "Resident", "Nurse", "Receptionist", "Laboratory", "Pharmacy", "Billing"],
  ipd: ["Owner", "Admin", "Manager", "Consultant", "Resident", "Nurse"],
  emergency: ["Owner", "Admin", "Manager", "Consultant", "Resident", "Nurse"],
  nursing: ["Owner", "Admin", "Manager", "Nurse", "Consultant", "Resident"],
  labs: ["Owner", "Admin", "Manager", "Consultant", "Resident", "Laboratory", "Nurse"],
  diagnostics: ["Owner", "Admin", "Manager", "Consultant", "Resident", "Laboratory"],
  pharmacy: ["Owner", "Admin", "Manager", "Pharmacy", "Consultant"],
  prescriptions: ["Owner", "Admin", "Manager", "Consultant", "Resident", "Pharmacy"],
  telemedicine: ["Owner", "Admin", "Manager", "Consultant", "Resident"],
  billing: ["Owner", "Admin", "Manager", "Billing", "Receptionist"],
  reports: ["Owner", "Admin", "Manager"],
  duty: ["Owner", "Admin", "Manager", "Consultant", "Resident", "Nurse"],
  workforce: ["Owner", "Admin", "Manager"],
  clinic: ["Owner", "Admin", "Manager"],
  clinic_setup: ["Owner", "Admin"],
  tariffs: ["Owner", "Admin", "Manager", "Billing"],
  blood_bank: ["Owner", "Admin", "Manager", "Consultant", "Nurse", "Laboratory"],
  insurance: ["Owner", "Admin", "Manager", "Billing"],
  clinical_assist: ["Owner", "Admin", "Manager", "Consultant", "Resident"],
  owner: ["Owner"],
};

export function normalizeClinicRole(role: string | null | undefined): string {
  const r = String(role || "").trim();
  if (!r) return "Consultant";
  // Alias common variants
  if (/^owner$/i.test(r)) return "Owner";
  if (/^admin/i.test(r)) return "Admin";
  if (/^manager/i.test(r)) return "Manager";
  if (/^consult/i.test(r) || /^doctor$/i.test(r)) return "Consultant";
  if (/^resid/i.test(r)) return "Resident";
  if (/^nurse/i.test(r)) return "Nurse";
  if (/^lab/i.test(r)) return "Laboratory";
  if (/^pharm/i.test(r)) return "Pharmacy";
  if (/^bill/i.test(r)) return "Billing";
  if (/^recept/i.test(r)) return "Receptionist";
  return r;
}

export function canAccessModule(role: string | null | undefined, module: MedLumModule): boolean {
  const r = normalizeClinicRole(role);
  if (r === "Owner") return true;
  const allowed = MODULE_ROLES[module] || [];
  return allowed.includes(r);
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
  { href: "/dashboard", label: "Dashboard", icon: "clinic", module: "dashboard" },
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
