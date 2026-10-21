import fs from "node:fs";
import assert from "node:assert/strict";

const page = fs.readFileSync("src/app/ipd/[id]/page.tsx","utf8");
const ipdApi = fs.readFileSync("src/app/api/ipd/route.ts","utf8");
const signingApi = fs.readFileSync("src/app/api/clinical-notes/route.ts","utf8");
const schema = fs.readFileSync("prisma/schema.prisma","utf8");

const has=(text,needle,label)=>assert.ok(text.includes(needle),label+": missing "+needle);
const notHas=(text,needle,label)=>assert.ok(!text.includes(needle),label+": unexpected "+needle);

has(page,'leftNav==="Initial Assessment"',"initial assessment UI");
has(page,'noteType:"Initial Assessment"',"canonical clinical note type");
has(page,"Sign & complete as author","author can sign and complete their own clinical note");
has(page,'action:"finalize"',"final signing action");
has(page,'timeZone:"Asia/Kolkata"',"IST assessment clock");
has(page,'UHID: {selected.uhid||selected.registrationNo||"Not assigned"}',"IPD clinical workspace shows a single patient-facing UHID");
has(page,"Final-sign as second clinician","optional alternate-clinician final signing remains available");

const initialStart=page.indexOf('leftNav==="Initial Assessment"');
const progressStart=page.indexOf('mainTab==="Clinical Notes"&&leftNav==="Progress Note"');
assert.ok(initialStart>=0&&progressStart>initialStart,"initial assessment section boundaries");
const initial=page.slice(initialStart,progressStart);
notHas(initial,'placeholder="Treatment given"',"initial assessment treatment field");
notHas(initial,"Treatment on discharge:","initial assessment discharge treatment");
notHas(initial,"Follow-up date/time:","initial assessment follow-up");

has(ipdApi,'const status = submit ? "PENDING_VERIFICATION" : "DRAFT"',"IPD note status");
has(ipdApi,"tx.clinicalNote.create","IPD notes persist as canonical clinical-note records");
has(ipdApi,"tx.clinicalNoteVersion.create","IPD note creation records version history");
has(ipdApi,"legacy-audit-","previously saved audit-only IPD notes remain visible");
has(ipdApi,"meta.noteId","new clinical-note audit events identify the canonical note");
has(ipdApi,"atIst: istIsoLabel(now)","server IST audit timestamp");
has(ipdApi,'authorName:n.author?.name||"Clinician"',"server author identity");
has(ipdApi,'verifierName:n.verifier?.name||null',"server verifier identity");

has(signingApi,"current.authorDoctorId === session.doctorId","author/verifier separation");
has(signingApi,'status: "PENDING_VERIFICATION"',"verification state");
has(signingApi,'status: "FINAL"',"final state");
has(signingApi,"verifierDoctorId: session.doctorId","server verifier");
has(signingApi,"canFinalizeClinicalNote(actor.normalizedRole)","role-gated final signing");

has(schema,"model ClinicalNote","canonical clinical note model");
has(schema,"verifierDoctorId","clinical verifier field");
has(schema,'status            String    @default("DRAFT")',"clinical note status");

console.log("IPD clinical workflow verification passed.");


// Clinical Notes signing and phone-width regression checks.
has(page,'DRAFT:"Draft · not signed"',"human-readable draft state must be explicit");
has(page,'PENDING_VERIFICATION:"Submitted · awaiting signature"',"submitted notes have a neutral pending-signature label");
has(page,'FINAL:"Signed / completed"',"final signed status is explicit without implying mandatory co-signing");
has(page,'timeZone:"Asia/Kolkata"',"note timestamps must use IST");
has(page,"clinicalNoteDateTime(n.createdAt)","note creation time is shown");
has(page,"Added by","note author is labelled in the list");
has(page,'className="grid gap-2 md:hidden"',"mobile note cards are present");
has(page,'hidden md:block overflow-x-auto border rounded-xl',"desktop notes table is hidden on small screens");
has(page,'flex flex-col md:flex-row min-w-0 min-h-[520px]',"IPD navigation and content stack on phones");
has(page,'action:"submit"',"existing author drafts can be submitted for verification from Note View");
has(page,'action:"finalize"',"eligible second clinician can final-sign from Note View");
has(page,'onClick={()=>void saveProgress(true)}',"Progress Note offers submit-for-verification action");
has(page,'onClick={()=>void saveNote(true,leftNav)}',"Consultant/RMO/Nursing/Case Summary forms offer submit-for-verification");
notHas(page,"MedLum ID:","IPD demographics show one primary patient-facing identifier");
notHas(page,"MedLum Record ID:","internal MedLum record key is not exposed as a duplicate patient identifier");

console.log("IPD note signing and mobile layout regression checks passed.");

has(page,'X-MedLum-Requested-With":"MedLum"', "clinical note signing calls carry the same-origin request header");
has(page,'UNSIGNED:"Unsigned"', "legacy unsigned status is human-readable");
has(ipdApi,'authorName: String(meta.authorRole).split(/\\s+·\\s+/)[0].trim()', "legacy audit note author display excludes the duplicated note title");
has(page,'n.authorDoctorId===doctor?.id', "only the note author can submit an existing draft");
has(page,'n.authorDoctorId!==doctor?.id', "the author cannot use the second-clinician action");

console.log("IPD note author, signing-header, and status compatibility checks passed.");

has(page,'>Submit</button>',"author can submit an existing draft directly from the desktop note list");
has(page,'>{saving?"Signing…":"Final-sign"}</button>',"a second verifier can final-sign directly from the mobile note list");
has(page,'["Owner","Admin","Manager","Consultant","Doctor","RMO"].includes(currentRole)',"final-sign action is exposed only for eligible clinical verifier roles");
has(page,"Sign &amp; complete as author","IPD note list offers author self-signing");
has(page,"cancelClinicalNote(n.id,n.status)","IPD note list offers audited cancellation/removal");
has(page,"Remove draft","draft removal affordance is explicit");
console.log("IPD list-level author signing, cancellation, and role visibility checks passed.");

has(signingApi,'const signedVersion = current.version + 1',"author sign creates a unique version instead of a duplicate version row");
has(signingApi,'contentHash: signedContentHash',"signed note content hash is updated for the new version");
