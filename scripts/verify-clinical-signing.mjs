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
const ipdRoute = read("src/app/api/ipd/route.ts");
const legacyRoute = read("src/app/api/clinical-notes/legacy/route.ts");

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
  ["IPD Case Summary note list exposes author self-sign action", ipdUi.includes("Sign &amp; complete as author") && ipdUi.includes("signOwnClinicalNote(n.id)")],
  ["IPD workspace exposes reason-required note removal", ipdUi.includes("cancelClinicalNote(n.id,n.status)") && ipdUi.includes("Enter a reason to remove this draft")],
  ["API client exposes submit/finalize", api.includes("apiSubmitClinicalNote") && api.includes("apiFinalizeClinicalNote")],
  ["Patient chart exposes author self-sign and optional independent verification", patientUi.includes("Sign & complete as author") && patientUi.includes("Final-sign as second clinician") && !patientUi.includes("Second verify + final sign")],
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


const authorSignBlock = route.slice(route.indexOf('if (action === "sign-own")'), route.indexOf('if (action === "finalize")'));
const versionChecks = [
  ["author signing advances the immutable note version", authorSignBlock.includes("const signedVersion = current.version + 1")],
  ["author-sign history row uses a unique next version", authorSignBlock.includes("version: signedVersion")],
  ["signed note stores matching signed version and content hash", authorSignBlock.includes("version: signedVersion, contentHash: signedContentHash")],
  ["author signing does not insert a duplicate current version", !authorSignBlock.includes('version: current.version,\n          title: "Author-signed"')],
];
const versionFailures = versionChecks.filter(([, ok]) => !ok);
for (const [label, ok] of versionChecks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (versionFailures.length) process.exit(1);
console.log("Author-sign version uniqueness regression checks: GREEN");


const authorSelfSignBlock = route.slice(route.indexOf('if (action === "sign-own")'), route.indexOf('if (action === "finalize")'));
const authorRoleChecks = [
  ["author can sign without inheriting second-verifier role requirements", !authorSelfSignBlock.includes("canFinalizeClinicalNote(actor.normalizedRole)")],
  ["self-sign is still author-only", authorSelfSignBlock.includes("current.authorDoctorId !== session.doctorId")],
  ["self-sign only accepts unsigned notes", authorSelfSignBlock.includes('["DRAFT", "PENDING_VERIFICATION"].includes(current.status)')],
];
const authorRoleFailures = authorRoleChecks.filter(([, ok]) => !ok);
for (const [label, ok] of authorRoleChecks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (authorRoleFailures.length) process.exit(1);
console.log("Author-sign role separation checks: GREEN");


const cancellationHistoryChecks = [
  ["legacy source activation is reused instead of recreated", legacyRoute.includes("priorActivation") && legacyRoute.includes("sourceAuditId:log.id")],
  ["already-cancelled legacy drafts cannot be reactivated", legacyRoute.includes("This legacy draft was already cancelled") && legacyRoute.includes('status:"CANCELLED"')],
  ["equivalent pre-existing drafts are linked to their legacy source", legacyRoute.includes("Link the legacy source even when an equivalent draft pre-existed")],
  ["cancelled note actor is retained via immutable version creator", ipdRoute.includes('event: "CANCELLED_BY_AUTHOR"') && ipdRoute.includes("cancelledVersion?.createdBy?.name")],
  ["cancellation time and reason are exposed from audit history", ipdRoute.includes("cancelledAt: cancelledVersion?.createdAt") && ipdRoute.includes("cancellationReason: typeof cancellation?.meta?.reason")],
  ["duplicate cancelled legacy activation is excluded from the note list", ipdRoute.includes("duplicateCancelledActivationIds.add(activatedNote.id)") && ipdRoute.includes("if (duplicateCancelledActivationIds.has(n.id)) continue")],
  ["cancelled note detail shows actor and reason", ipdUi.includes("Cancelled by:") && ipdUi.includes("n.cancellationReason")],
];
const cancellationHistoryFailures = cancellationHistoryChecks.filter(([, ok]) => !ok);
for (const [label, ok] of cancellationHistoryChecks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (cancellationHistoryFailures.length) process.exit(1);
console.log("IPD cancellation de-duplication and attribution checks: GREEN");

const signatureHashDelimiterChecks = [
  ["IPD author-sign final hash uses newline separators", ipdRoute.includes('`${note.content}\\nAUTHOR:${note.authorDoctorId}\\nAUTHOR_SIGNATURE:${session.doctorId}\\nNOTE:${note.id}`')],
  ["IPD independent-sign final hash uses newline separators", ipdRoute.includes('`${note.content}\\nAUTHOR:${note.authorDoctorId}\\nVERIFIER:${session.doctorId}\\nNOTE:${note.id}`')],
  ["IPD immediate author-sign final hash uses newline separators", ipdRoute.includes('`${content}\\nAUTHOR:${session.doctorId}\\nAUTHOR_SIGNATURE:${session.doctorId}\\nNOTE:${created.id}`')],
  ["clinical-notes author-sign final hash uses newline separators", route.includes('`${current.content}\\nAUTHOR:${current.authorDoctorId}\\nAUTHOR_SIGNATURE:${session.doctorId}\\nNOTE:${current.id}`')],
  ["clinical-notes independent-sign final hash uses newline separators", route.includes('`${current.content}\\nAUTHOR:${current.authorDoctorId}\\nVERIFIER:${session.doctorId}\\nNOTE:${current.id}`')],
];
const signatureHashDelimiterFailures = signatureHashDelimiterChecks.filter(([, ok]) => !ok);
for (const [label, ok] of signatureHashDelimiterChecks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (signatureHashDelimiterFailures.length) process.exit(1);
console.log("Clinical signature hash delimiter regression checks: GREEN");
