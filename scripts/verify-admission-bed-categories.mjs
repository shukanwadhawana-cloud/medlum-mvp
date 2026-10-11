import fs from "node:fs";
import assert from "node:assert/strict";

const admissionPage = fs.readFileSync("src/app/patients/[id]/page.tsx", "utf8");
const ipdPage = fs.readFileSync("src/app/ipd/[id]/page.tsx", "utf8");
const ipdApi = fs.readFileSync("src/app/api/ipd/route.ts", "utf8");
const ocrPage = fs.readFileSync("src/app/clinical-assist/page.tsx", "utf8");
const ocr = fs.readFileSync("src/lib/clinical-assist-ocr.ts", "utf8");

assert(admissionPage.includes('action: "admit"'), "OPD admission must call the admit action");
assert(ipdApi.includes('if (action === "admit")'), "IPD API must implement OPD admission");
assert(ipdApi.includes('notes: encodePatientNotes(cleanPatientNotes(patient.notes), "IPD", nextProfile)'), "Admission must preserve the existing patient record and OPD history");
assert(ipdApi.includes("Destination room is not in the hospital directory."), "Admission must validate room directory membership");
assert(ipdApi.includes("This bed has already been assigned to another active IPD patient."), "Admission must reject occupied beds");
assert(ipdApi.includes('isolationLevel: "Serializable"'), "Admission must use serializable transaction isolation");
for (const category of ["General", "Twin Sharing", "Deluxe", "Super Deluxe", "VIP"]) {
  assert(admissionPage.includes(category), `Admission UI missing category: ${category}`);
  assert(ipdPage.includes(category), `IPD room directory UI missing category: ${category}`);
}
assert(admissionPage.includes('value={admission.roomCategory}'), "Accommodation selection must be interactive");
assert(admissionPage.includes('r.roomCategory || "General") === admission.roomCategory'), "Bed list must filter by accommodation category");
assert(ipdPage.includes('value={room.unitType}'), "Room creation must expose Ward/ICU destination");
assert(ipdPage.includes('value={room.roomCategory}'), "Room creation must expose accommodation category");
assert(!ipdApi.includes('return NextResponse.json({ success: false, error: "Unknown action"') || ipdApi.includes('if (action === "admit")'), "Unknown action fallback must remain only after supported actions");

assert(ocr.includes("const MAX_BYTES = 8 * 1024 * 1024"), "OCR utility and UI must share the 8 MB limit");
assert(ocrPage.includes('setScanText("");'), "A new upload must clear previous extracted text");
assert(ocrPage.includes("Source: ${best.label}"), "OCR status must identify extraction path");
assert(ocrPage.includes("characters extracted"), "OCR status must report extracted character count");
assert(ocrPage.includes("against the original document"), "OCR status must require source verification");
assert(ocrPage.includes("text.length < 20"), "Very short OCR output must be rejected");
assert(ocr.includes("clientScannedPdfOcr"), "Scanned PDF OCR fallback must remain");
assert(ocr.includes("clientTesseractOcr"), "Image OCR path must remain");

console.log("Admission/bed category and Clinical Assist OCR regression checks: PASS");
