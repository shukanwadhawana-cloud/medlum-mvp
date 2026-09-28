import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const required = [
  "src/app/telemedicine/[id]/page.tsx",
  "src/app/api/encounters/route.ts",
  "src/app/api/telemedicine/sessions/route.ts",
  "src/app/api/telemedicine/sessions/[id]/route.ts",
  "src/app/appointments/page.tsx",
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`missing ${file}`);
}

const workspace = fs.readFileSync(path.join(root, "src/app/telemedicine/[id]/page.tsx"), "utf8");
const encounters = fs.readFileSync(path.join(root, "src/app/api/encounters/route.ts"), "utf8");
const sessions = fs.readFileSync(path.join(root, "src/app/api/telemedicine/sessions/route.ts"), "utf8");
const sessionId = fs.readFileSync(path.join(root, "src/app/api/telemedicine/sessions/[id]/route.ts"), "utf8");
const appointments = fs.readFileSync(path.join(root, "src/app/appointments/page.tsx"), "utf8");

const checks = [
  ["workspace uses existing Encounter API", workspace.includes("apiCreateEncounter") || workspace.includes("/api/encounters")],
  ["workspace captures core clinical fields", ["chiefComplaint", "clinicalNotes", "diagnosis", "assessment", "plan"].every((f) => workspace.includes(f))],
  ["workspace captures vitals", ["bp", "pulse", "temperature", "spo2"].every((f) => workspace.includes(f))],
  ["complete requires clinical save path", workspace.includes("completeConsultation") && workspace.includes("saveClinicalDocumentation")],
  ["redirects to patient chart", workspace.includes("/patients/") && workspace.includes("/chart")],
  ["links appointmentId into encounter payload", workspace.includes("appointmentId")],
  ["patient context loaded", workspace.includes("apiGetPatientDetail")],
  ["dictation is optional draft aid", workspace.includes("Dictate") || workspace.includes("SpeechRecognition")],
  ["no paid LLM imports", !/from ["']openai|@google\/generative|anthropic|whisper/i.test(workspace)],
  ["provider branding not primary UI label", !/Provider:\s*\{?session\?\.provider/i.test(workspace) && !workspace.includes("Join the MiroTalk")],
  ["appointment can start telemedicine", appointments.includes("/api/telemedicine/sessions") && (appointments.includes("Start Telemedicine") || appointments.includes("Start Video"))],
  ["encounter API creates ClinicalNote draft", encounters.includes("clinicalNote.create") && encounters.includes('"DRAFT"')],
  ["session completion still supported", sessionId.includes('"Completed"')],
  ["facility scope on sessions", sessions.includes("requireActiveClinicMembership")],
];

for (const [name, ok] of checks) if (!ok) failures.push(`failed ${name}`);

if (failures.length) {
  console.error("Telemedicine clinical workflow verification FAILED");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log("Telemedicine clinical workflow verification PASSED");
for (const [name] of checks) console.log(`✓ ${name}`);
