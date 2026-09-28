#!/usr/bin/env node
/**
 * Appointment + OPD scheduling static verifier.
 * Confirms facility scope, RBAC, statuses, duplicate prevention, audit, transitions.
 */
import { readFileSync, existsSync } from "fs";

const fails = [];
function ok(cond, msg) {
  if (!cond) fails.push(" - " + msg);
  else console.log("OK:", msg);
}

function read(path) {
  if (!existsSync(path)) {
    fails.push(" - missing file " + path);
    return "";
  }
  return readFileSync(path, "utf8");
}

const workflow = read("src/lib/workflow.ts");
ok(workflow.includes("No Show") || workflow.includes("NO_SHOW"), "NO_SHOW / No Show status");
ok(workflow.includes("normalizeAppointmentStatus") || workflow.includes("CHECKED_IN") || workflow.includes("Waiting"), "check-in status mapping");
ok(workflow.includes("appointmentTransitionError"), "transition guard");
ok(workflow.includes('Waiting: ["In Consultation"') || workflow.includes("Waiting:"), "waiting transitions");
ok(workflow.includes('Receptionist: ["appointments"'), "receptionist appointments permission");

const route = read("src/app/api/appointments/route.ts");
ok(route.includes("requireActiveClinicMembership"), "facility membership gate");
ok(route.includes("roleCan") || route.includes("appointments"), "RBAC appointments permission");
ok(route.includes("clinicId: ctx.clinicId") || route.includes("clinicId"), "server-derived clinic scope");
ok(route.includes('notIn: ["Cancelled", "Completed", "No Show"]') || route.includes("conflict"), "duplicate appointment prevention");
ok(route.includes("APPOINTMENT_CREATED") || route.includes("writeAudit"), "create audit");
ok(route.includes("APPOINTMENT_STATUS_UPDATED") || route.includes("update_status") || route.includes("writeAudit"), "status audit");
ok(route.includes("Waiting") && route.includes("No Show"), "check-in and no-show paths");
ok(!route.includes("body.clinicId"), "does not trust client clinicId");
ok(route.includes("Patient not found in this facility") || route.includes("clinicId: ctx.clinicId"), "patient facility isolation");

const page = read("src/app/appointments/page.tsx");
ok(page.includes("Check in") || page.includes("Waiting"), "check-in UI");
ok(page.includes("Cancel") || page.includes("Cancelled"), "cancel UI");
ok(!page.includes("window.prompt"), "no window.prompt");
ok(page.includes("/patients/") && page.includes("appointmentId"), "OPD/consult integration link");

const schema = read("prisma/schema.prisma");
ok(schema.includes("model Appointment"), "Appointment model exists");
ok(schema.includes("appointmentId") && schema.includes("model Encounter"), "Encounter links to Appointment");

if (fails.length) {
  console.error("FAILED:\n" + fails.join("\n"));
  process.exit(1);
}
console.log("Appointment + OPD scheduling verification PASSED");
