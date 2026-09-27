import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const staffId = fs.readFileSync(path.join(root, "src/lib/staff-id.ts"), "utf8");
const login = fs.readFileSync(path.join(root, "src/app/api/auth/login/route.ts"), "utf8");
const loginPage = fs.readFileSync(path.join(root, "src/app/login/page.tsx"), "utf8");
const api = fs.readFileSync(path.join(root, "src/lib/api.ts"), "utf8");

const checks = [
  ["role prefixes include CL/RN/RM/ON", /CL|RN|RM|ON/.test(staffId) && staffId.includes('"CL"') && staffId.includes('"ON"')],
  ["allocateStaffCode uses randomBytes", staffId.includes("randomBytes")],
  ["findDoctorByStaffLoginId exported", staffId.includes("findDoctorByStaffLoginId")],
  ["login accepts staffId", login.includes("staffId") && login.includes("findDoctorByStaffLoginId")],
  ["login does not require email as sole identifier", login.includes("Staff Login ID")],
  ["login page MedLum Staff ID", loginPage.includes("MedLum Staff ID") && loginPage.includes("staffId")],
  ["apiLogin sends staffId", api.includes("staffId") && api.includes("apiLogin(staffId")],
  ["no PHI derivation in generator", !/aadhaar|dateOfBirth|phone\.|email\.slice/i.test(staffId)],
];

for (const [name, ok] of checks) if (!ok) failures.push(name);

if (failures.length) {
  console.error("Staff Login ID verification FAILED");
  for (const f of failures) console.error("-", f);
  process.exit(1);
}
console.log("Staff Login ID verification PASSED");
for (const [name] of checks) console.log("✓", name);
