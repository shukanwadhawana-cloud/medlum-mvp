#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const ai = read("src/lib/clinical-ai.ts");
const route = read("src/app/api/clinical-ai/draft/route.ts");
const encounters = read("src/app/api/encounters/route.ts");
const tele = exists("src/app/telemedicine/[id]/page.tsx")
  ? read("src/app/telemedicine/[id]/page.tsx")
  : "";
const schema = read("prisma/schema.prisma");

const checks = [
  ["clinical-ai is server-only", ai.includes('import "server-only"') || ai.includes("server-only")],
  ["API keys only via env", ai.includes("CLINICAL_AI_API_KEY") && !ai.includes("sk-live")],
  ["heuristic fallback exists", ai.includes("heuristicClinicalDraft")],
  ["draft endpoint requires session", route.includes("getSession")],
  ["draft endpoint requires membership", route.includes("requireActiveClinicMembership")],
  ["clinical role gate", route.includes("Clinical AI draft is restricted")],
  ["no auto-sign in AI module", !ai.includes("status: \"SIGNED\"") && !route.includes("SIGNED")],
  ["no prescription create in AI", !ai.includes("prescription.create") && !route.includes("prescription")],
  ["no lab order create in AI", !ai.includes("labOrder.create")],
  ["Encounter API still creates DRAFT notes", encounters.includes('status: "DRAFT"')],
  ["no parallel AIEncounter model", !schema.includes("model AIEncounter") && !schema.includes("model USClinicalNote")],
  ["audit on draft request", route.includes("clinical_ai_draft")],
  ["telemedicine still uses apiCreateEncounter", tele.includes("apiCreateEncounter")],
  ["telemedicine has AI Assist affordance", tele.includes("clinical-ai/draft") || tele.includes("AI Assist") || tele.includes("AI DRAFT")],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error("FAIL:", name);
    failed++;
  } else console.log("PASS:", name);
}
if (failed) {
  console.error(`\nClinical AI workflow verification FAILED (${failed})`);
  process.exit(1);
}
console.log("\nClinical AI workflow verification PASSED");
console.log("Note: AI does not finalize or claim autonomous medical decisions.");
