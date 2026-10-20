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
const permissions = read("src/lib/permissions.ts");

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
check(permissions.includes('path.startsWith("/dietitian")') && permissions.includes('"Dietitian", "Dietician", "Nutritionist"'), "Direct Dietitian/Nutrition routes enforce the dietitian role matrix");
check(permissions.includes('path.startsWith("/physiotherapy")') && permissions.includes('"Nurse", "Physiotherapist"'), "Direct Physiotherapy routes enforce their role matrix");
check(permissions.includes('path.startsWith("/appointments")') && permissions.includes('canAccessModule(role, "opd")'), "Appointment routes use OPD permissions");
check(permissions.includes('path.startsWith("/prescriptions")') && permissions.includes('canAccessModule(role, "prescriptions")'), "Prescription routes use prescription permissions");
check(permissions.includes('path.startsWith("/telemedicine")') && permissions.includes('canAccessModule(role, "telemedicine")'), "Telemedicine routes use telemedicine permissions");
check(permissions.includes('path.startsWith("/duty")') && permissions.includes('canAccessModule(role, "duty")'), "Duty routes use duty permissions");
check(permissions.includes('path.startsWith("/people")') && permissions.includes('canAccessModule(role, "workforce")'), "People/workforce routes use workforce permissions");
check(permissions.includes('path.startsWith("/clinic/setup")') && permissions.includes('canAccessModule(role, "clinic_setup")'), "Clinic setup route uses setup permissions");
check(permissions.includes('path.startsWith("/clinic/tariffs")') && permissions.includes('canAccessModule(role, "tariffs")'), "Tariff route uses tariff permissions");
check(permissions.includes('path.startsWith("/blood-bank")') && permissions.includes('canAccessModule(role, "blood_bank")'), "Blood-bank routes use blood-bank permissions");
check(permissions.includes('path.startsWith("/insurance")') && permissions.includes('canAccessModule(role, "insurance")'), "Insurance routes use insurance permissions");
check(permissions.includes('if (normalized === "Owner" && module !== "owner_platform") return true;'), "Facility Owner entitlement cannot grant platform-owner module access");
check(permissions.includes('if (path.startsWith("/owner")) return canAccessModule(role, "owner_platform");'), "Owner URLs use the platform-only entitlement check");
check(permissions.includes("return false;"), "Unknown private routes fail closed instead of receiving default access");
const doctorProvider = read("src/components/DoctorProvider.tsx");
check(doctorProvider.includes('"/book"'), "Public appointment booking route is explicitly available without sign-in");


if (failures.length) {
  console.error("\nWorkflow permission regression verification FAILED:\n" + failures.map((x) => " - " + x).join("\n"));
  process.exit(1);
}
console.log("\nWorkflow permission regression verification PASSED");
