/**
 * Static verification: AI-assisted clinical documentation (draft-only).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    failures.push(`missing file: ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const clinicalAi = read("src/lib/clinical-ai.ts");
const draftRoute = read("src/app/api/clinical-ai/draft/route.ts");
const button = read("src/components/ClinicalAiAssistButton.tsx");
const telePage = read("src/app/telemedicine/[id]/page.tsx");
const clinicalAssist = read("src/app/clinical-assist/page.tsx");
const encounters = read("src/app/api/encounters/route.ts");
const signing = read("src/lib/clinical-signing.ts");
const schema = read("prisma/schema.prisma");
const pkg = read("package.json");

const checks = [
  ["clinical-ai service exists", clinicalAi.includes("generateClinicalDraft") && clinicalAi.includes("heuristicClinicalDraft")],
  ["heuristic fallback without keys", clinicalAi.includes('provider: "heuristic"') && clinicalAi.includes("offline: true")],
  [
    "optional OpenAI + Gemini adapters (server-only)",
    clinicalAi.includes("OPENAI_API_KEY") &&
      (clinicalAi.includes("GEMINI_API_KEY") || clinicalAi.includes("GOOGLE_AI_API_KEY")) &&
      !clinicalAi.includes("NEXT_PUBLIC_OPENAI") &&
      !clinicalAi.includes("NEXT_PUBLIC_GEMINI"),
  ],
  ["draft API requires session", draftRoute.includes("getSession") && draftRoute.includes("Unauthorized")],
  ["draft API requires clinic membership", draftRoute.includes("requireActiveClinicMembership")],
  ["draft API requires clinical role", draftRoute.includes("canViewFullClinicalChart")],
  [
    "draft API does not trust client clinicId/doctorId",
    /Intentionally ignore|client-supplied clinicId/i.test(draftRoute) &&
      !draftRoute.includes("body.clinicId") &&
      !draftRoute.includes("body.doctorId"),
  ],
  [
    "AI output is draft-only",
    draftRoute.includes("AI_DRAFT") && !draftRoute.includes("canFinalizeClinicalNote") && !draftRoute.includes("finalizedAt"),
  ],
  [
    "AI route never creates clinical records/orders",
    !draftRoute.includes("encounter.create") &&
      !draftRoute.includes("clinicalNote.create") &&
      !draftRoute.includes("prescription.create") &&
      !draftRoute.includes("labOrder.create") &&
      !draftRoute.includes("diagnosticOrder.create"),
  ],
  ["AI route never signs", !draftRoute.includes("authorDoctorId") && !draftRoute.includes("finalHash")],
  [
    "ClinicalAiAssistButton is draft control only",
    button.includes("onDraft") && button.includes("/api/clinical-ai/draft") && !button.includes("apiCreateEncounter"),
  ],
  ["telemedicine integrates AI Assist", telePage.includes("ClinicalAiAssistButton") && telePage.includes("applyAiDraft")],
  ["telemedicine uses Encounter API", telePage.includes("apiCreateEncounter")],
  ["clinical-assist integrates AI Assist", clinicalAssist.includes("ClinicalAiAssistButton")],
  ["Encounter creates ClinicalNote DRAFT", encounters.includes("clinicalNote.create") && encounters.includes('"DRAFT"')],
  ["clinical signing intact", signing.includes("hashClinicalNote") && signing.includes("canFinalizeClinicalNote")],
  [
    "no parallel AI clinical models",
    !schema.includes("model AIEncounter") && !schema.includes("model AIClinicalNote") && !schema.includes("model TelemedicineEncounter"),
  ],
  [
    "no paid LLM npm dependency",
    !/"openai"\s*:/.test(pkg) && !/"@google\/generative-ai"\s*:/.test(pkg) && !/"anthropic"\s*:/.test(pkg),
  ],
  [
    "manual path intact",
    telePage.includes("Dictate") && telePage.includes("saveClinicalDocumentation") && telePage.includes("SpeechRecognition"),
  ],
  ["audit of AI draft", draftRoute.includes("writeAudit") && draftRoute.includes("clinical_ai_draft")],
  [
    "no ambient call transcription claims",
    !/listening to the call|recording the call/i.test(telePage) && !/mirotalk/i.test(clinicalAi),
  ],
];

for (const [name, ok] of checks) {
  if (!ok) failures.push(`failed: ${name}`);
}

if (failures.length) {
  console.error("Clinical AI workflow verification FAILED");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log("Clinical AI workflow verification PASSED");
for (const [name] of checks) console.log(`✓ ${name}`);
