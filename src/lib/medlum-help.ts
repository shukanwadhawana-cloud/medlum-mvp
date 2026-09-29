import "server-only";

type HelpEntry = { keywords: string[]; answer: string };

const ENTRIES: HelpEntry[] = [
  { keywords: ["appointment","book","schedule","reschedule","cancel"], answer: "Appointments: open Appointments, choose the patient and clinician, select the date/time, then save. Active/upcoming appointments are shown in the active views; completed and cancelled appointments remain in history. Reschedule or cancel from the appointment workflow rather than creating a duplicate booking." },
  { keywords: ["patient","register","registration","active","archive"], answer: "Patients: new registrations start as ACTIVE. Use the patient list and OPD/IPD filters to find the appropriate record. Discharged or archived patients are intentionally separated from the active workflow; the canonical patient record is retained." },
  { keywords: ["consultation","opd","draft","confirm","save","clinical note"], answer: "OPD consultation: select or register the patient, complete the clinical note, save a draft when needed, then confirm the completed consultation. Confirmation keeps the same patient/encounter record and makes the completed OPD record available for the supported print/history workflow." },
  { keywords: ["ipd","admission","discharge","discharged"], answer: "IPD: admission and discharge use the existing patient lifecycle. Discharge requires the required clinical summary details and explicit confirmation; finalization changes the patient to DISCHARGED while retaining the clinical history. Do not create a second discharge record manually." },
  { keywords: ["emergency","er","casualty","admit"], answer: "Emergency: create the emergency clinical orders in the existing emergency workflow. When an admission is required, use the existing Admit to IPD action so the same patient lifecycle and audit trail are retained." },
  { keywords: ["lab","laboratory","sample","result"], answer: "Laboratory: create orders against the selected patient, then use the laboratory queue for collection, processing and result/review states. Laboratory records are facility-scoped, including safe handling of older patient records that predate clinic assignment." },
  { keywords: ["diagnostic","radiology","imaging","study","report"], answer: "Diagnostics: create the study order for the selected patient, then update it through Ordered, Performed and Reported states. Findings and impression are required before a study is marked Reported. Records are facility-scoped." },
  { keywords: ["ocr","scan","document","pdf","photo"], answer: "Clinical Assist OCR: upload a PDF or supported image and MedLum processes it on the server as editable draft text. Review the source and extracted fields before saving. HEIC/HEIF is currently unsupported; export or retake it as JPG/PNG or upload a PDF." },
  { keywords: ["clinical assist","ai assistant","ai","draft"], answer: "Clinical Assist is a drafting aid. You can use OCR, terminology suggestions, voice dictation and the clinical draft assistant, but patient identity, extracted text, diagnosis, medicines, doses and the final note must be reviewed by the clinician before saving or acting." },
  { keywords: ["pharmacy","medicine","prescription","dispense"], answer: "Pharmacy: use the existing prescription and dispensing workflow tied to the canonical patient/encounter. Do not create a separate patient record just for dispensing; verify the patient and medicine details before completing the transaction." },
  { keywords: ["billing","invoice","payment","tariff"], answer: "Billing: use the existing tariff, invoice and payment workflow. Clinic tariffs can be maintained from the Clinic Tariffs area, including the supported Excel import. Payment state changes remain protected against incorrect reuse of cancelled or completed records." },
  { keywords: ["telemedicine","video","consult"], answer: "Telemedicine: start the consultation from the supported appointment/clinical workflow, then use the generated session/join path. The clinical record remains in MedLum; the video provider is a separate service layer." },
  { keywords: ["telegram","otp","connect","notification"], answer: "Telegram: configured staff identities and facility Telegram integration are kept separate from the clinical patient record. Use the account's Telegram linking/connect workflow and complete the verification step before relying on Telegram authentication or notifications." },
  { keywords: ["chatwoot","support","help desk"], answer: "Help and support: MedLum Help provides in-app workflow guidance. Where Chatwoot is configured, the Help area can open a facility-scoped staff support conversation. Clinical patient records are not sent to Chatwoot by the Help integration." },
  { keywords: ["attendance","punch","check in","check out"], answer: "Attendance: use the staff attendance workflow to record punch-in and punch-out. Location checks, where enabled, are applied by the attendance workflow; do not manually alter attendance records outside the supported staff workflow." },
  { keywords: ["role","permission","access","rbac"], answer: "Access: MedLum applies session authentication plus active clinic membership and role-based permissions. Facility roles determine operational access; a user should not bypass an unavailable module by calling its API directly." },
  { keywords: ["pilot","expiry","trial","grace","locked"], answer: "Pilot access: facilities move through active, warning, grace and locked states based on the configured pilot end date. Locking deactivates facility operations without deleting clinical data. Owner/Admin recovery remains available through the intended administrative path." },
  { keywords: ["portal","patient portal"], answer: "Patient Portal is isolated from the staff workspace. Portal sessions are scoped to the portal user and do not replace staff authentication or clinic membership checks." },
  { keywords: ["help","chat","support"], answer: "MedLum Help provides free in-app workflow guidance. Ask about a specific workflow such as appointments, OPD, IPD, emergency, laboratory, diagnostics, pharmacy, billing, Clinical Assist, Telegram, attendance or access." },
];

export function medLumHelpAnswer(question: string) {
  const q = question.toLowerCase();
  const hit = ENTRIES.find((entry) => entry.keywords.some((keyword) => q.includes(keyword)));
  if (hit) return hit.answer;
  return "I can guide you through MedLum workflows including patients, appointments, OPD, IPD, emergency, laboratory, diagnostics, Clinical Assist/OCR, pharmacy, billing/tariffs, telemedicine, Telegram, attendance, access, Help and the patient portal. Ask about one workflow and I’ll give the relevant steps.";
}

export const MEDLUM_HELP_KNOWLEDGE_VERSION = "2026-09-29.1";
