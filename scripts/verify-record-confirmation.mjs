import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const api=read("src/lib/api.ts");
const cancel=read("src/app/api/records/cancel/route.ts");
const schema=read("prisma/schema.prisma");
const page=read("src/app/patients/[id]/page.tsx");
const checks=[
 ["client mutation confirmation",api.includes("confirmMutation") && api.includes('window.confirm')],
 ["clinical note confirmation",api.includes("apiCreateClinicalNote") && api.includes('clinical note draft')],
 ["generic cancellation API",cancel.includes('const cancellable') && cancel.includes('action: "CLINICAL_NOTE_CANCELLED"') && cancel.includes('reflected:true')],
 ["final clinical cancellation is retained",cancel.includes('status:"CANCELLED"') && cancel.includes('previousStatus')],
 ["clinical note cancellation retains content and version history",cancel.includes('event: "CANCELLED_BY_AUTHOR"') && cancel.includes("tx.clinicalNoteVersion.create") && !cancel.includes("tx.clinicalNote.delete")],
 ["clinical note cancellation is restricted to original author",cancel.includes("note.authorDoctorId !== session.doctorId") && cancel.includes("Only the original author can cancel this unsigned note.")],
 ["signed-note cancellation is blocked in this endpoint",cancel.includes("Signed/final notes must use an amendment workflow.") && cancel.includes("CLINICAL_NOTE_CANCELLED")],
 ["encounter cancellation state",schema.includes('status           String') && schema.includes('cancellationReason')],
 ["prescription cancellation state",schema.includes('model Prescription') && schema.includes('cancelledAt')],
 ["patient UI cancellation",page.includes('apiCancelRecord') && page.includes('Cancel final record') && page.includes('Cancel draft')],
 ["orders cancellation UI",page.includes('cancelRecord("LabOrder"') && page.includes('cancelRecord("DiagnosticOrder"') && page.includes('cancelRecord("Prescription"')],
 ["vitals/encounter cancellation UI",page.includes('cancelRecord("Encounter"')],
];
const bad=checks.filter(([,ok])=>!ok);
if(bad.length){console.error(bad.map(x=>x[0]).join("\n"));process.exit(1);}
console.log("record confirmation/cancellation checks passed:",checks.length);
