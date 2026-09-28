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
has(page,"second-clinician verification","provisional submission");
has(page,'action:"finalize"',"final signing action");
has(page,'timeZone:"Asia/Kolkata"',"IST assessment clock");
has(page,"Final-sign as second clinician","final signing button");

const initialStart=page.indexOf('leftNav==="Initial Assessment"');
const progressStart=page.indexOf('mainTab==="Clinical Notes"&&leftNav==="Progress Note"');
assert.ok(initialStart>=0&&progressStart>initialStart,"initial assessment section boundaries");
const initial=page.slice(initialStart,progressStart);
notHas(initial,'placeholder="Treatment given"',"initial assessment treatment field");
notHas(initial,"Treatment on discharge:","initial assessment discharge treatment");
notHas(initial,"Follow-up date/time:","initial assessment follow-up");

has(ipdApi,'status:submit?"PENDING_VERIFICATION":"DRAFT"',"IPD note status");
has(ipdApi,'atIst:istIsoLabel(new Date())',"server IST audit timestamp");
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
