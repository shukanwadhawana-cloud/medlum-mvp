import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
function check(condition, message) {
  if (condition) console.log("PASS:", message);
  else { failures.push(message); console.error("FAIL:", message); }
}

const invoicePrint = read("src/app/api/invoices/print/route.ts");
const pharmacy = read("src/app/api/pharmacy/route.ts");
const prescriptionPrint = read("src/app/api/prescriptions/print/route.ts");
const labPrint = read("src/app/api/labs/print/route.ts");
const ipdPrint = read("src/app/api/ipd/print/route.ts");
const ipdApi = read("src/app/api/ipd/route.ts");
const owner = read("src/app/owner/page.tsx");
const ownerHospitals = read("src/app/owner/hospitals/page.tsx");
const docker = read("Dockerfile");
const entrypoint = read("scripts/render-entrypoint.sh");

check(invoicePrint.includes("canViewBillingDetail(membership.role)"), "Invoice print payload enforces the billing role matrix");
check((pharmacy.match(/if \(!canManagePharmacy\(membership\.role\)\)/g) || []).length >= 5, "Pharmacy read, inventory mutations, and dispensing actions are role-gated");
check(prescriptionPrint.includes("canViewClinicalChart(membership.role)") && prescriptionPrint.includes("canManagePharmacy(membership.role)"), "Prescription printing is limited to clinical-chart or pharmacy roles");
check(labPrint.includes("canViewClinicalChart(membership.role)") && labPrint.includes("canManageLab(membership.role)"), "Lab printing is limited to clinical-chart or lab-management roles");
check(ipdPrint.includes("canViewClinicalChart(membership.role)"), "Discharge summary printing enforces clinical-chart access");
check(ipdApi.includes("canFinalizeClinicalNote(normalizeClinicRole(membership.role))") && ipdApi.includes("verifierDoctorId: null"), "Discharge finalization requires a distinct authorized verifier");
check(owner.includes("const isOwner = Boolean(doctor.isOwner)") && !owner.includes('primaryRole === "Owner"'), "Owner dashboard UI does not substitute a facility role for platform-owner entitlement");
check(!ownerHospitals.includes('primaryRole!=="Owner"'), "Hospital-owner screen matches platform-owner authorization");
check(docker.includes('ENTRYPOINT ["sh", "/app/scripts/render-entrypoint.sh"]'), "Render startup uses an explicit entrypoint script rather than inline shell quoting");
check(entrypoint.includes("npx prisma migrate deploy") && entrypoint.includes('exec npm start'), "Render entrypoint retains migration retry behavior and starts the app only after migrations succeed");

if (failures.length) {
  console.error("\nWorkflow permission regression verification FAILED:\n" + failures.map((x) => " - " + x).join("\n"));
  process.exit(1);
}
console.log("\nWorkflow permission regression verification PASSED");
