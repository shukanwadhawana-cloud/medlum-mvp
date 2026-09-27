#!/usr/bin/env node
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fails = [];
function ok(cond, msg) {
  if (!cond) fails.push(msg);
  else console.log("OK:", msg);
}

const staffApi = read("src/app/api/clinic/staff/route.ts");
const clinicAuth = read("src/lib/clinic-auth.ts");
const workforcePage = read("src/app/workforce/page.tsx");
const clinicPage = read("src/app/clinic/page.tsx");
const schema = read("prisma/schema.prisma");

ok(schema.includes("model ClinicMember"), "ClinicMember model retained");
ok(schema.includes("staffCode"), "staffCode in schema");
ok(schema.includes("designation") && schema.includes("department"), "designation/department in schema");
ok(schema.includes("model WorkforceRecord"), "WorkforceRecord model retained");
ok(schema.includes("model DutyAttendanceEvent"), "DutyAttendanceEvent retained");
ok(!/model\s+StaffUser|model\s+Employee\b/.test(schema), "no parallel StaffUser/Employee model");
ok(staffApi.includes("requireActiveClinicMembership"), "staff API uses requireActiveClinicMembership");
ok(staffApi.includes("clinicId: ctx.membership.clinicId"), "staff queries scoped to membership clinicId");
ok(clinicAuth.includes("getSelectedClinicId") && clinicAuth.includes("requireActiveClinicMembership"), "facility context helpers present");
ok(clinicAuth.includes("security boundary") || clinicAuth.includes("cookie is only a selector"), "facility cookie documented as non-authoritative");
ok(staffApi.includes('["Owner", "Admin", "Manager"]'), "Owner/Admin/Manager gate for staff management");
ok(staffApi.includes("Managers cannot change staff roles") || staffApi.includes("Managers cannot deactivate"), "Manager limits encoded");
ok(staffApi.includes("Only the clinic owner can assign Admin") || staffApi.includes("Only the clinic owner can create an Admin"), "Owner-only Admin assignment");
ok(staffApi.includes("staffCode"), "staffCode preserved in responses/audits");
ok(staffApi.includes("CLINIC_MEMBER_DEACTIVATED") || staffApi.includes("deactivatedAt"), "soft deactivation");
ok(staffApi.includes("update-details"), "update-details action");
ok(workforcePage.includes("/api/clinic/staff"), "workforce page calls staff API");
ok(workforcePage.includes("Staff directory") || workforcePage.includes("Staff &"), "staff directory UI present");
ok(workforcePage.includes("designation") && workforcePage.includes("department"), "designation/department in UI");
ok(workforcePage.includes("active") && workforcePage.includes("inactive"), "active/inactive filters");
ok(workforcePage.includes("deactivate") && workforcePage.includes("reactivate"), "deactivate/reactivate actions");
ok(workforcePage.includes("telegram"), "telegram status surfaced");
ok(workforcePage.includes("/api/duty") && workforcePage.includes("/api/workforce"), "connects to duty + workforce records");
ok(clinicPage.includes("designation") && clinicPage.includes("department"), "clinic create form sends designation/department");
ok(clinicPage.includes("/workforce"), "clinic page links to workforce hub");
ok(staffApi.includes("never reassigned") || staffApi.includes("staffCode: target.staffCode"), "permanent staff code on role change");

if (fails.length) {
  console.error("\nStaff & Workforce verification FAILED:");
  for (const f of fails) console.error("-", f);
  process.exit(1);
}
console.log("\nStaff & Workforce verification PASSED");
