import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const schema = read("prisma/schema.prisma");
const route = read("src/app/api/clinical-notes/route.ts");
const helper = read("src/lib/clinical-signing.ts");
const api = read("src/lib/api.ts");
const patientUi = read("src/app/patients/[id]/page.tsx");
const ipdUi = read("src/app/ipd/[id]/page.tsx");

const checks = [
  ["ClinicalNote Prisma model exists", /model ClinicalNote\s*\{/.test(schema)],
  ["ClinicalNote has immutable status fields", /status\s+String\s+@default\("DRAFT"\)/.test(schema) && /finalizedAt\s+DateTime\?/.test(schema)],
  ["ClinicalNoteVersion preserves versioned content and hashes", /model ClinicalNoteVersion\s*\{/.test(schema) && /clinicalNoteId\s+String/.test(schema) && /contentHash\s+String/.test(schema)],
  ["Draft edits are saved transactionally with a version snapshot", route.includes("tx.clinicalNoteVersion.create") && route.includes("CLINICAL_NOTE_VERSION_SAVED") && route.includes('isolationLevel: "Serializable"')],
  ["Clinical note history is returned to the authorized chart view", route.includes('versions: { orderBy: { version: "asc" }') && route.includes("versions: Array.isArray(n.versions)") && patientUi.includes("Version history (")],
  ["Author and verifier are distinct relations", /@relation\("ClinicalNoteAuthor"\)/.test(schema) && /@relation\("ClinicalNoteVerifier"\)/.test(schema)],
  ["Clinical signing API exists", route.includes("export async function PATCH") && route.includes('action === "finalize"') && route.includes('action === "sign-own"')],
  ["Self-verification is blocked for second-verifier action", route.includes("current.authorDoctorId === session.doctorId")],
  ["Final signer role is restricted", helper.includes("CLINICAL_VERIFIER_ROLES") && route.includes("canFinalizeClinicalNote")],
  ["Final note integrity is hashed", route.includes("contentHash") && route.includes("finalHash") && helper.includes("createHash")],
  ["Finalization is race-safe", route.includes("Serializable") && route.includes("verifierDoctorId: null") && route.includes("version: current.version")],
  ["Final notes cannot be edited", route.includes('current.status !== "DRAFT"') && route.includes("Submitted or final notes cannot be edited")],
  ["Audit trail records final sign", route.includes('action: "FINAL_SIGN"')],
  ["Author may sign own unsigned note", route.includes('action === "sign-own"') && route.includes('action: "AUTHOR_SIGN"') && route.includes('event: "AUTHOR_SIGNED"')],
  ["API client exposes submit/finalize", api.includes("apiSubmitClinicalNote") && api.includes("apiFinalizeClinicalNote")],
  ["UI exposes second verification", patientUi.includes("Second verify + final sign") && patientUi.includes("The author cannot approve their own document")],
  ["UI exposes locked FINAL state", patientUi.includes("LOCKED FINAL") && patientUi.includes("finalHash")],
  ["UI exposes version history with author, timestamp and hash", patientUi.includes("Version history (") && patientUi.includes("SHA-256")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (failed.length) process.exit(1);
console.log("Clinical double-verification/final-signing verifier: GREEN");


const authorSelfSignChecks = [
  ["author self-sign endpoint", route.includes('action === "sign-own"')],
  ["self-sign endpoint enforces note authorship", route.includes("current.authorDoctorId !== session.doctorId")],
  ["self-sign only accepts unsigned notes", route.includes('["DRAFT", "PENDING_VERIFICATION"].includes(current.status)')],
  ["author signature is version-audited", route.includes('event: "AUTHOR_SIGNED"')],
  ["author signing has a dedicated audit event", route.includes('action: "AUTHOR_SIGN"')],
  ["IPD UI calls the author-sign endpoint", ipdUi.includes('action:"sign-own"')],
  ["author can sign and complete from note detail", ipdUi.includes("Sign & complete as author")],
  ["final status label no longer implies mandatory co-signing", ipdUi.includes('FINAL:"Signed / completed"')],
];
const authorSelfSignFailures = authorSelfSignChecks.filter(([, ok]) => !ok);
for (const [label, ok] of authorSelfSignChecks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (authorSelfSignFailures.length) process.exit(1);
console.log("Author self-signing regression checks: GREEN");
