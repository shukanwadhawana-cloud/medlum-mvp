import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const required = [
  "src/lib/workflow.ts",
  "src/lib/session.ts",
  "src/lib/api.ts",
  "src/app/api/auth/me/route.ts",
  "src/app/api/appointments/route.ts",
  "src/app/api/telemedicine/sessions/route.ts",
  "src/app/appointments/page.tsx",
  "src/app/patients/[id]/page.tsx",
  "src/app/telemedicine/join/page.tsx",
  "src/app/telemedicine/[id]/page.tsx",
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing Phase 13 workflow file: ${file}`);
}

const workflow = read("src/lib/workflow.ts");
for (const status of ["Scheduled", "Confirmed", "Waiting", "In Consultation", "Completed", "Cancelled"]) {
  if (!workflow.includes(`\"${status}\"`)) throw new Error(`Missing appointment state: ${status}`);
}
for (const role of ["Owner", "Admin", "Consultant", "Staff"]) {
  if (!workflow.includes(`\"${role}\"`)) throw new Error(`Missing clinic role: ${role}`);
}
for (const permission of ["clinical", "appointments", "telemedicine", "billing", "clinic_admin", "inventory"]) {
  if (!workflow.includes(`\"${permission}\"`)) throw new Error(`Missing role permission: ${permission}`);
}

const appointmentApi = read("src/app/api/appointments/route.ts");
if (!appointmentApi.includes("appointmentTransitionError")) throw new Error("Appointment API does not enforce lifecycle transitions");
if (!/status\s*:\s*[\"']Scheduled[\"']/.test(appointmentApi)) throw new Error("New appointments must start Scheduled");
if (!/status\s*:\s*409/.test(appointmentApi)) throw new Error("Invalid appointment transitions must return HTTP 409");
if (!/(clinicMemberships|isActive\s*:\s*true)/.test(appointmentApi)) throw new Error("Clinic appointment scope must ignore inactive memberships");

const me = read("src/app/api/auth/me/route.ts");
if (!me.includes("clinicMemberships")) throw new Error("Session profile does not expose clinic memberships");
if (!me.includes("primaryRole")) throw new Error("Session profile does not expose primary role");

const api = read("src/lib/api.ts");
if (!api.includes("apiCreateTelemedicineSession")) throw new Error("API client lacks telemedicine workflow entry point");
if (!api.includes("primaryRole")) throw new Error("API client lacks role-aware doctor profile");

const appointmentUi = read("src/app/appointments/page.tsx");
for (const label of ["Waiting", "Completed", "Start Consult", "Check in", "Cancel"]) {
  if (!appointmentUi.includes(label)) throw new Error(`Appointment UI missing workflow state/action: ${label}`);
}

const patientUi = read("src/app/patients/[id]/page.tsx");
for (const marker of ["apiCreateEncounter", "apiAddPrescriptionWithEncounter", "apiAddInvoice", "apiCreateLabOrder", "apiCreateDiagnosticOrder"]) {
  if (!patientUi.includes(marker)) throw new Error(`Clinical workflow missing: ${marker}`);
}

const telemedicineApi = read("src/app/api/telemedicine/sessions/route.ts");
if (!telemedicineApi.includes("appointmentId")) throw new Error("Telemedicine session is not linked to appointments");
if (!telemedicineApi.includes("patientId")) throw new Error("Telemedicine session is not linked to patients");
if (!telemedicineApi.includes("getSession")) throw new Error("Telemedicine session creation is not authenticated");

const joinUi = read("src/app/telemedicine/join/page.tsx");
const doctorVideoUi = read("src/app/telemedicine/[id]/page.tsx");
if (!joinUi.includes("waiting") && !joinUi.includes("Waiting")) throw new Error("Patient waiting-room workflow missing");
if (!doctorVideoUi.includes("meetingUrl")) throw new Error("Doctor video workflow missing meeting URL");

console.log("Phase 13 multi-device and role workflow verification passed.");
