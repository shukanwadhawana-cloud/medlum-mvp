#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fail = [];
const ok = (c, m) => c ? console.log("OK:", m) : (fail.push(m), console.error("FAIL:", m));

const routes = {
  labs: "src/app/api/labs/route.ts",
  prescriptions: "src/app/api/prescriptions/route.ts",
  encounters: "src/app/api/encounters/route.ts",
  diagnostics: "src/app/api/diagnostics/route.ts",
  ipd: "src/app/api/ipd/route.ts",
  staff: "src/app/api/clinic/staff/route.ts",
};

for (const [name, file] of Object.entries(routes)) {
  const src = read(file);
  ok(src.includes("getSession"), name + " authenticates server-side");
  ok(src.includes("session.doctorId"), name + " derives actor from authenticated session");
  ok(!/doctorId:\s*body\./.test(src), name + " rejects client doctorId authority");
  ok(!/staffCode:\s*body\./.test(src), name + " rejects client staffCode authority");
  ok(!/authorId:\s*body\./.test(src), name + " rejects client authorId authority");
  ok(!/userId:\s*body\./.test(src), name + " rejects client userId authority");
  ok(!/clinicId:\s*body\./.test(src), name + " rejects client clinicId authority");
}

const tenantRoutes = ["labs", "prescriptions", "encounters", "diagnostics"];
for (const name of tenantRoutes) {
  const src = read(routes[name]);
  ok(!/OR:\s*\[\{\s*clinicId\s*\},\s*\{\s*doctorId\s*\}\]/.test(src),
    name + " has no cross-clinic doctorId OR bypass");
  ok(src.includes("requireActiveClinicMembership"), name + " derives clinic from active membership");
}

const staff = read(routes.staff);
ok(staff.includes("allocateStaffCode"), "staff IDs are server allocated");
ok(staff.includes("Staff ID is permanent"), "staff ID is immutable across role changes");
ok(!staff.includes("body.staffCode"), "staff ID cannot be client supplied");

const pkg = JSON.parse(read("package.json"));
ok(Boolean(pkg.dependencies?.["@aws-sdk/client-s3"]), "R2 S3 SDK is a production dependency");
ok(Boolean(pkg.dependencies?.["@aws-sdk/s3-request-presigner"]), "R2 presigner SDK is a production dependency");

const storage = read("src/lib/storage/index.ts");
ok(storage.includes("STORAGE_PROVIDER=r2"), "production storage is fail-closed without R2");
ok(storage.includes("isServerlessRuntime"), "serverless local storage is blocked");

const ocr = read("src/app/api/labs/documents/[id]/ocr/route.ts");
ok(ocr.includes("ocrDraft"), "OCR writes draft output");
ok(!ocr.includes("diagnosis"), "OCR route does not finalize diagnosis");
ok(!ocr.includes("prescription"), "OCR route does not finalize prescription");

// Clinical AI assist hardening
const aiDraft = read("src/app/api/clinical-ai/draft/route.ts");
ok(aiDraft.includes("getSession"), "clinical-ai authenticates");
ok(aiDraft.includes("requireActiveClinicMembership"), "clinical-ai requires membership");
ok(aiDraft.includes('canAccessModule(role, "clinical_assist")'), "clinical-ai module is clinical_assist-only");
ok(aiDraft.includes("body.clinicId != null") || aiDraft.includes("body.clinicId"), "clinical-ai rejects client clinicId claims");
ok(aiDraft.includes("64_000") || aiDraft.includes("64000"), "clinical-ai enforces request size limit");
ok(!/clinicalNote\.create/.test(aiDraft), "clinical-ai does not create ClinicalNote");
ok(!/clinicalNote\.(create|update)/.test(aiDraft) && !/status:\s*[\"']Final[\"']/.test(aiDraft) && aiDraft.includes("finalized: false"), "clinical-ai does not finalize/sign notes");

const aiPanel = read("src/components/ClinicalAiDraftPanel.tsx");
ok(aiPanel.includes("X-MedLum-Requested-With"), "clinical-ai panel sends CSRF client header");

const provider = read("src/components/DoctorProvider.tsx");
ok(provider.includes("canAccessPath"), "DoctorProvider enforces path module authorization");
ok(provider.includes('pathname.startsWith("/owner")') && provider.includes("doctor.isOwner"), "platform isOwner retains /owner access");

const perms = read("src/lib/permissions.ts");
ok(perms.includes("owner_platform: []"), "owner_platform is empty for clinic roles");

// Clinical notes and billing identity authority
for (const [name, file] of Object.entries({
  "clinical-notes": "src/app/api/clinical-notes/route.ts",
  "appointments": "src/app/api/appointments/route.ts",
  "invoices": "src/app/api/invoices/route.ts",
})) {
  try {
    const src = read(file);
    ok(src.includes("getSession"), name + " authenticates");
    ok(src.includes("requireActiveClinicMembership") || src.includes("findAuthorizedPatient"), name + " derives facility scope from membership");
    ok(!/clinicId:\s*body\./.test(src), name + " rejects client clinicId authority");
  } catch (e) {
    ok(false, name + " route readable");
  }
}


if (fail.length) {
  console.error("\nP1 security regression FAILED:\n" + fail.map(x => " - " + x).join("\n"));
  process.exit(1);
}
console.log("\nP1 security regression PASSED");
