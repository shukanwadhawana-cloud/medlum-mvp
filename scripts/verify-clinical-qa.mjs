#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const endpoint = readFileSync("src/app/api/ipd/[id]/clinical-qa/route.ts", "utf8");
const component = readFileSync("src/components/ClinicalQAPanel.tsx", "utf8");
const ipd = readFileSync("src/app/ipd/[id]/page.tsx", "utf8");
const questions = [
  "antibiotic-day", "last-antibiotic-dose", "missed-doses", "current-medications", "creatinine-trend", "latest-labs", "latest-vitals", "pending-investigations", "last-24-hours", "allergies-diagnosis", "mar-last-24h", "pending-doses", "antibiotic-review", "medication-reconciliation", "vte-prophylaxis", "cbc-results", "hemoglobin-trend", "wbc-trend", "electrolyte-trend", "glucose-results", "abnormal-labs", "latest-imaging", "microbiology-results", "infection-workup", "latest-assessment-plan", "latest-note", "nursing-observations", "latest-handover", "patient-round-summary", "cognition-delirium", "goals-escalation", "discharge-plan", "devices-lines", "urine-output", "nutrition-plan", "mobility-safety", "pain-assessment"
];

for (const question of questions) {
  assert.ok(endpoint.includes('"' + question + '"'), "API supports preset question " + question);
  assert.ok(component.includes('"' + question + '"'), "UI displays preset question " + question);
}
assert.match(endpoint, /getSession\(\)/, "clinical Q&A requires an authenticated session");
assert.match(endpoint, /requireActiveClinicMembership/, "clinical Q&A resolves active clinic membership");
assert.match(endpoint, /canViewFullClinicalChart/, "clinical Q&A enforces the full-chart role policy");
assert.match(endpoint, /requireClinicalModule[\s\S]*?"IPD"/, "clinical Q&A checks IPD entitlement");
assert.match(endpoint, /findAuthorizedPatient/, "patient ID is resolved in the authorized clinic scope");
assert.match(endpoint, /consumeRateLimit/, "clinical Q&A is rate limited");
assert.match(endpoint, /CLINICAL_QA_ANSWERED/, "successful requests are audit logged");
assert.match(endpoint, /Cache-Control[\s\S]{0,60}no-store/, "chart answers disable caching");
assert.match(endpoint, /QUESTION_IDS\.has\(questionId\)/, "only preset questions can be submitted");
assert.doesNotMatch(endpoint, /chatwoot|api\.openai\.com|generativelanguage\.googleapis\.com|generateClinicalDraft/i, "patient Q&A does not use support chat or external model APIs");
assert.match(component, /Read-only · no external AI call/, "UI explains the processing mode");
assert.match(component, /Source records/, "answers expose chart source records");
assert.match(component, /clinical-qa-question-search/, "question library has a searchable control");
assert.match(component, /visibleQuestions/, "question search filters the displayed library");
assert.match(endpoint, /ADDITIONAL_QUESTION_IDS\.has\(questionId\)/, "expanded preset questions have a dedicated answer path");
assert.match(endpoint, /Structured intake\/output or fluid-balance observations are not queried/, "unavailable structured I/O data is disclosed rather than inferred");
assert.match(endpoint, /does not automatically declare them equivalent/, "prescription/MAR review avoids claiming an automatic reconciliation");
assert.match(ipd, /ClinicalQAPanel/, "IPD workspace integrates the question panel");
assert.match(ipd, /Clinical Q&A/, "IPD workspace exposes a dedicated Clinical Q&A tab");
console.log("Clinical Q&A security contract: PASS (static checks only; runtime acceptance runs separately)");
