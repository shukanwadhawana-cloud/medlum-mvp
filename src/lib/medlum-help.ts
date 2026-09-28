import "server-only";

type HelpEntry = { keywords: string[]; answer: string };

const ENTRIES: HelpEntry[] = [
  { keywords: ["appointment","book","schedule"], answer: "To book an appointment, open Appointments, choose the patient and clinician, select the date/time, then save. Cancelled and completed appointments remain in history; active appointments are shown in the relevant active/upcoming views." },
  { keywords: ["patient","register","registration","active"], answer: "Newly registered patients are created as ACTIVE. Use Patients with the OPD/IPD filters enabled to find them. Discharged or archived patients are intentionally excluded from the active list." },
  { keywords: ["consultation","opd","draft","confirm","save"], answer: "For an OPD consultation, save the clinical draft first when needed, then confirm the completed consultation. Confirmation should retain the same patient/encounter record and make the completed OPD record available for printing." },
  { keywords: ["ipd","discharge"], answer: "IPD discharge requires the discharge date/time, diagnosis, condition on discharge and acknowledgement. Finalization creates the discharge summary and changes the patient to DISCHARGED as one server-side transaction." },
  { keywords: ["lab","laboratory","diagnostic","report"], answer: "Laboratory and diagnostic orders/results are facility-scoped. Use the active/history queues for work in progress and completed reports; patient/chart links remain on the canonical patient record." },
  { keywords: ["telegram","otp","connect"], answer: "Telegram is used for configured authentication/notifications. A staff member's Telegram identity and facility integration are kept separate from the clinical patient record." },
  { keywords: ["help","chat","support"], answer: "MedLum Help provides free in-app workflow guidance. If a facility has Chatwoot configured, the same Help area can also open a facility-scoped staff support conversation." },
  { keywords: ["billing","invoice","payment"], answer: "Billing uses the existing tariff, invoice and payment workflow. Payment state changes are protected so cancelled/paid records cannot be incorrectly reused." },
];

export function medLumHelpAnswer(question: string) {
  const q = question.toLowerCase();
  const hit = ENTRIES.find((entry) => entry.keywords.some((keyword) => q.includes(keyword)));
  if (hit) return hit.answer;
  return "I can help with MedLum workflows such as patient registration, appointments, OPD consultation, IPD discharge, laboratory/diagnostic work, billing, Telegram setup, and MedLum Help. Ask about one of those workflows and I’ll guide you.";
}

export const MEDLUM_HELP_KNOWLEDGE_VERSION = "2026-09-28.1";
