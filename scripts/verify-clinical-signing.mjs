import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const schema = read("prisma/schema.prisma");
const route = read("src/app/api/clinical-notes/route.ts");
const helper = read("src/lib/clinical-signing.ts");
const api = read("src/lib/api.ts");
const patientUi = read("src/app/patients/[id]/page.tsx");

const checks = [
  ["ClinicalNote Prisma model exists", /model ClinicalNote\s*\{/.test(schema)],
  ["ClinicalNote has immutable status fields", /status\s+String\s+@default\("DRAFT"\)/.test(schema) && /finalizedAt\s+DateTime\?/.test(schema)],
  ["Author and verifier are distinct relations", /@relation\("ClinicalNoteAuthor"\)/.test(schema) && /@relation\("ClinicalNoteVerifier"\)/.test(schema)],
  ["Clinical signing API exists", route.includes("export async function PATCH") && route.includes('action === "finalize"')],
  ["Self-verification is blocked", route.includes("current.authorDoctorId === session.doctorId")],
  ["Final signer role is restricted", helper.includes("CLINICAL_VERIFIER_ROLES") && route.includes("canFinalizeClinicalNote"),
  ["Final note integrity is hashed", route.includes("contentHash") && route.includes("finalHash") && helper.includes("createHash"),
  ["Finalization is race-safe", route.includes("Serializable") && route.includes("verifierDoctorId: null") && route.includes("version: current.version")],
  ["Final notes cannot be edited", route.includes('current.status !== "DRAFT"') && route.includes("Submitted or final notes cannot be edited"),
  ["Audit trail records final sign", route.includes('action: "FINAL_SIGN"')],
  ["API client exposes submit/finalize", api.includes("apiSubmitClinicalNote") && api.includes("apiFinalizeClinicalNote")],
  ["UI exposes second verification", patientUi.includes("Second verify + final sign") && patientUi.includes("The author cannot approve their own document")],
  ["UI exposes locked FINAL state", patientUi.includes("LOCKED FINAL") && patientUi.includes("finalHash"),
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (failed.length) process.exit(1);
console.log("Clinical double-verification/final-signing verifier: GREEN");
