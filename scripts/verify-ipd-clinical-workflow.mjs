import fs from "node:fs";
import assert from "node:assert/strict";

const page = fs.readFileSync("src/app/ipd/[id]/page.tsx","utf8");
const ipdApi = fs.readFileSync("src/app/api/ipd/route.ts","utf8");
const signingApi = fs.readFileSync("src/app/api/clinical-notes/route.ts","utf8");
const cancelApi = fs.readFileSync("src/app/api/records/cancel/route.ts","utf8");
const caseSummaryApi = fs.readFileSync("src/app/api/ipd/[id]/case-summary/route.ts","utf8");
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

has(ipdApi,'const status = sign ? "FINAL" : submit ? "PENDING_VERIFICATION" : "DRAFT"',"IPD note supports draft, direct author signing, and optional co-signature");
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
has(page,'PENDING_VERIFICATION:"Awaiting co-signature"',"submitted notes show optional co-signature state");
has(page,'FINAL:"Signed / completed"',"final signed status is explicit without implying mandatory co-signing");
has(page,'timeZone:"Asia/Kolkata"',"note timestamps must use IST");
has(page,"clinicalNoteDateTime(n.createdAt)","note creation time is shown");
has(page,"Added by","note author is labelled in the list");
has(page,'className="grid gap-2 md:hidden"',"mobile note cards are present");
has(page,'hidden md:block overflow-x-auto border rounded-xl',"desktop notes table is hidden on small screens");
has(page,'flex flex-col md:flex-row min-w-0 min-h-[520px]',"IPD navigation and content stack on phones");
has(page,'action:"submit"',"existing author drafts can be submitted for verification from Note View");
has(page,'action:"finalize"',"eligible second clinician can final-sign from Note View");
has(page,'onClick={()=>void saveProgress(true,false)',"Progress Note offers explicit optional co-signature action");
has(page,'onClick={()=>void saveNote(true,leftNav,false)',"Consultant/RMO/Nursing/Case Summary forms offer explicit optional co-signature");
notHas(page,"MedLum ID:","IPD demographics show one primary patient-facing identifier");
notHas(page,"MedLum Record ID:","internal MedLum record key is not exposed as a duplicate patient identifier");

console.log("IPD note signing and mobile layout regression checks passed.");

has(page,'X-MedLum-Requested-With":"MedLum"', "clinical note signing calls carry the same-origin request header");
has(page,'UNSIGNED:"Unsigned"', "legacy unsigned status is human-readable");
has(ipdApi,'authorName: String(meta.authorRole).split(/\\s+·\\s+/)[0].trim()', "legacy audit note author display excludes the duplicated note title");
has(page,'n.authorDoctorId===doctor?.id', "only the note author can submit an existing draft");
has(page,'n.authorDoctorId!==doctor?.id', "the author cannot use the second-clinician action");

console.log("IPD note author, signing-header, and status compatibility checks passed.");

has(page,'Submit for co-signature"',"author can submit an existing draft for optional co-signature from the desktop note list");
has(page,'>{saving?"Signing…":"Final-sign"}</button>',"a second verifier can final-sign directly from the mobile note list");
has(page,'["Owner","Admin","Manager","Consultant","Doctor","RMO"].includes(currentRole)',"final-sign action is exposed only for eligible clinical verifier roles");
has(page,"Sign &amp; complete as author","IPD note list offers author self-signing");
has(page,"cancelClinicalNote(n.id,status)","IPD note list offers audited cancellation/removal for unsigned notes");
has(page,"Remove draft","legacy draft removal affordance is explicit");
notHas(page,'(n.status==="FINAL"&&["Owner","Admin"].includes(currentRole))',"signed final notes are not offered the cancel/remove shortcut");
console.log("IPD list-level author signing, cancellation, and role visibility checks passed.");

has(signingApi,'const signedVersion = current.version + 1',"author sign creates a unique version instead of a duplicate version row");
has(signingApi,'contentHash: signedContentHash',"signed note content hash is updated for the new version");


// Save-time signing and cancel-before-co-signature regression coverage.
has(ipdApi,'const sign = body.sign === true',"IPD API receives direct author-sign intent");
has(ipdApi,'finalizedAt: sign ? now : null',"author-signed notes persist a finalization timestamp");
has(ipdApi,'event: sign ? "CREATED_AND_AUTHOR_SIGNED" : submit ? "CREATED_AND_SUBMITTED" : "CREATED_DRAFT"',"direct author signature is recorded in note-version history");
has(ipdApi,'action: sign ? "AUTHOR_SIGN" : submit ? "SUBMIT_FOR_VERIFICATION" : "CREATE_DRAFT"',"direct author signature is recorded in audit log");
has(page,'onClick={e=>void saveStructured(e as any,false,true)',"Initial Assessment offers save-time sign and complete");
has(page,'onClick={()=>void saveProgress(false,true)',"Progress Note offers save-time sign and complete");
has(page,'onClick={()=>void saveNote(false,leftNav,true)',"Consultant/RMO/Nursing/Case Summary offers save-time sign and complete");
has(cancelApi,'if (entity === "ClinicalNote")',"existing audited ClinicalNote cancellation route is used");
has(cancelApi,"Only the original author can cancel this unsigned note.","draft cancellation is restricted to the original author");
has(cancelApi,"Only the original author can cancel this unsigned note.","cancellation checks authorship");
has(cancelApi,"Signed/final notes must use an amendment workflow.","signed notes are blocked from the cancellation shortcut");
has(cancelApi,'if (!["DRAFT", "PENDING_VERIFICATION"].includes(note.status))',"cancellation is limited to draft or awaiting-co-signature statuses");
has(cancelApi,'action: "CLINICAL_NOTE_CANCELLED"',"cancellation is written to the audit log");
has(page,'showCancelledNotes?clinicalNotes:clinicalNotes.filter((n:any)=>n.status!=="CANCELLED")',"cancelled notes are hidden in the active Note View and can be revealed");
has(page,'onClick={()=>setShowCancelledNotes(v=>!v)}',"Note View exposes Show/Hide cancelled toggle");
has(page,'cancelClinicalNote(n.id,status)',"author can cancel/remove before co-signature from Note View");
has(signingApi,'status: { not: "CANCELLED" }',"default clinical-notes API hides cancelled notes");
has(caseSummaryApi,'status: { not: "CANCELLED" }',"generated case summaries exclude cancelled notes");
console.log("IPD direct signing, optional co-signature, and cancellation regression checks passed.");


// Open-note cancel/remove and signature-integrity guardrails.
has(page,'This note is saved but unsigned. Sign and complete it as the author, or submit it for optional co-signature.',"open-note guidance offers author signing and optional co-signature");
has(page,'{canCancelOwn&&<button type="button" disabled={saving} onClick={()=>void cancelClinicalNote(n.id,status)}',"open note detail has a cancel/remove button");
has(page,'Sign &amp; complete</button><button type="button" disabled={saving} onClick={()=>void removeLegacyDraft(n.id)',"legacy draft detail preserves sign/remove actions");
has(cancelApi,'if (!["DRAFT", "PENDING_VERIFICATION"].includes(note.status))',"cancellation endpoint permits only draft/pending notes");
has(cancelApi,'Signed/final notes must use an amendment workflow.',"signed/final notes are not cancellable");
has(cancelApi,'Only the original author can cancel this unsigned note.',"only the original note author can cancel");
has(page,'onClick={()=>setShowCancelledNotes(v=>!v)',"Note View exposes Show/Hide cancelled");
has(page,'visibleClinicalNotes.length?visibleClinicalNotes.map',"cancelled notes are hidden in active Note View");
has(caseSummaryApi,'status: { not: "CANCELLED" }',"generated case summaries omit cancelled notes");
has(ipdApi,'finalHash = hashClinicalNote(`${content}\\nAUTHOR:${session.doctorId}\\nAUTHOR_SIGNATURE:${session.doctorId}\\nNOTE:${created.id}`, version);',"direct author-sign uses the canonical newline-separated hash payload");
console.log("Open-note cancellation and signature hash checks passed.");
