#!/usr/bin/env node
/**
 * Static + structural verification for AI-assisted clinical documentation.
 * Does not call live AI providers or mutate production data.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
let failed = 0;

function ok(cond, msg) {
  if (cond) console.log("  ✓", msg);
  else {
    console.error("  ✗", msg);
    failed += 1;
  }
}

function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

console.log("verify-clinical-ai-draft");

const lib = read("src/lib/clinical-ai.ts");
const route = read("src/app/api/clinical-ai/draft/route.ts");
const page = read("src/app/clinical-assist/page.tsx");
const signing = read("src/lib/clinical-signing.ts");
const notes = read("src/app/api/clinical-notes/route.ts");

ok(!!lib, "src/lib/clinical-ai.ts exists");
ok(!!route, "src/app/api/clinical-ai/draft/route.ts exists");
ok(lib?.includes("generateHeuristicDraft"), "heuristic draft generator present");
ok(lib?.includes("validateDraftSections"), "structured output validation present");
ok(lib?.includes("server-only"), "clinical-ai is server-only");
ok(lib?.includes("AI-generated draft for clinician review"), "disclaimer present");
ok(!lib?.includes("OPENAI_API_KEY") || lib?.includes("process.env.OPENAI_API_KEY"), "provider keys only via env");

ok(route?.includes("getSession"), "draft route requires session");
ok(route?.includes("requireActiveClinicMembership"), "draft route requires clinic membership");
ok(route?.includes("clinicId: membership.clinicId"), "facility isolation on patient lookup");
ok(route?.includes("AI_DRAFT_GENERATED") || route?.includes("AI_DRAFT_REQUESTED"), "audit actions present");
ok(route?.includes("finalized: false"), "endpoint never claims finalization");
ok(route?.includes("consumeRateLimit"), "rate limiting applied");
ok(!route?.includes("status: \"FINAL\""), "draft route does not finalize notes");

ok(signing?.includes("canFinalizeClinicalNote"), "clinical signing helpers preserved");
ok(notes?.includes("FINAL_SIGN") || notes?.includes("finalize"), "clinical-notes finalize path preserved");
const panel = read("src/components/ClinicalAiDraftPanel.tsx");
ok(!!panel, "src/components/ClinicalAiDraftPanel.tsx exists");
ok(
  page?.includes("ClinicalAiDraftPanel") ||
    page?.includes("clinical-ai/draft") ||
    page?.includes("AI-GENERATED DRAFT") ||
    page?.includes("Generate AI draft"),
  "clinical-assist UI wires draft assist",
);
ok(panel?.includes("/api/clinical-ai/draft"), "draft panel calls generation endpoint");
ok(panel?.includes("not a final clinical record") || panel?.includes("AI-generated draft"), "draft panel labels draft status");
ok(!route?.includes("patient.diagnosis") && !route?.includes("workingDiagnosis"), "draft route does not select non-schema Patient fields");
ok(route?.includes("notes: true") || route?.includes("patient.notes"), "draft route uses existing Patient.notes when available");

// Ensure no client exposure of secrets in UI
ok(!page?.includes("OPENAI_API_KEY"), "UI does not reference provider secrets");
ok(!page?.includes("GEMINI_API_KEY"), "UI does not reference Gemini secrets");
ok(!panel?.includes("OPENAI_API_KEY") && !panel?.includes("GEMINI_API_KEY"), "panel does not reference provider secrets");

if (failed) {
  console.error(`\nFAILED (${failed})`);
  process.exit(1);
}
console.log("\nAll clinical-ai draft checks passed.");
process.exit(0);
