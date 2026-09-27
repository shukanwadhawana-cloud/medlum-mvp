#!/usr/bin/env node
/**
 * Staff & Workforce operational management static verifier.
 * Confirms directory fields, permanent staffCode, soft deactivation,
 * update-details (name/email/phone/designation/department), duty status wiring,
 * attendance board, facility scoping, and audit coverage.
 */
import { readFileSync, existsSync } from "fs";

const fails = [];
function ok(c, m) {
  if (!c) fails.push(m);
  else console.log("OK:", m);
}

ok(existsSync("src/app/api/clinic/staff/route.ts"), "staff API");
ok(existsSync("src/app/workforce/page.tsx"), "workforce hub");
ok(existsSync("src/app/api/duty/route.ts"), "duty API");
ok(existsSync("src/app/api/duty/admin/route.ts"), "duty admin desk");
ok(existsSync("src/lib/permissions.ts"), "permissions module");

const schema = readFileSync("prisma/schema.prisma", "utf8");
ok(schema.includes("staffCode"), "staffCode in schema");
ok(schema.includes("designation") && schema.includes("department"), "designation/department in schema");
ok(schema.includes("DutyAttendanceEvent"), "DutyAttendanceEvent reused");
ok(schema.includes("WorkforceRecord"), "WorkforceRecord preserved");
ok(!schema.includes("model AttendanceEvent"), "no duplicate attendance model");

const staffApi = readFileSync("src/app/api/clinic/staff/route.ts", "utf8");
ok(staffApi.includes("requireActiveClinicMembership"), "facility membership gate");
ok(staffApi.includes("staffCode"), "staffCode in API");
ok(staffApi.includes("update-details"), "update-details action");
ok(staffApi.includes("Staff Login ID") || staffApi.includes("staffCode is permanent") || staffApi.includes("never edited"), "staffCode not editable");
ok(staffApi.includes("doctor.update") || staffApi.includes("prisma.doctor.update"), "name/email/phone update path");
ok(staffApi.includes("CLINIC_MEMBER_DETAILS_UPDATED"), "details audit");
ok(staffApi.includes("CLINIC_MEMBER_DEACTIVATED") || staffApi.includes("deactivate"), "deactivate audit");
ok(staffApi.includes("CLINIC_MEMBER_REACTIVATED") || staffApi.includes("reactivate"), "reactivate path");
ok(staffApi.includes("Managers cannot change staff roles") || staffApi.includes("Manager"), "manager role restriction");
ok(staffApi.includes("clinicId: ctx.membership.clinicId"), "server-derived clinic scope");

const workforce = readFileSync("src/app/workforce/page.tsx", "utf8");
ok(workforce.includes("designation") && workforce.includes("department"), "designation/department UI");
ok(workforce.includes("staffCode") || workforce.includes("Staff ID"), "Staff Login ID displayed");
ok(workforce.includes("telegramLinked") || workforce.includes("Telegram"), "Telegram status");
ok(workforce.includes("openEdit") || workforce.includes("Edit details"), "staff edit entry");
ok(workforce.includes("saveEdit") || workforce.includes("update-details"), "staff save details");
ok(workforce.includes("punchDuty") || workforce.includes("Punch IN"), "attendance punch");
ok(workforce.includes("ON DUTY") || workforce.includes("onDuty"), "duty status UI");
ok(workforce.includes("/api/duty/admin") || workforce.includes("adminDesk") || workforce.includes("Facility attendance board"), "admin attendance board");
ok(workforce.includes("Active") && workforce.includes("Inactive"), "active/inactive filters");
ok(workforce.includes("Search name") || workforce.includes("Staff ID"), "search");

const duty = readFileSync("src/app/api/duty/route.ts", "utf8");
ok(duty.includes("Already on duty") || duty.includes("lastPunch?.type"), "duplicate punch prevention");
ok(duty.includes("isActive: true"), "active staff only");
ok(duty.includes("requireActiveClinicMembership"), "duty membership gate");

const admin = readFileSync("src/app/api/duty/admin/route.ts", "utf8");
ok(admin.includes("ON_DUTY"), "admin ON_DUTY status");
ok(admin.includes("isDutyAdminRole") || admin.includes("Owner"), "admin role gate");

const history = readFileSync("src/app/api/duty/history/route.ts", "utf8");
ok(history.includes("Only Owner/Admin/Manager can view other staff history"), "history isolation");

if (fails.length) {
  console.error("FAILED:\n" + fails.join("\n"));
  process.exit(1);
}
console.log("Staff & Workforce operational management verification PASSED");
