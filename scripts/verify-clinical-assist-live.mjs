#!/usr/bin/env node
/**
 * Live acceptance test for Clinical Assist's server-side source checksum guard.
 *
 * This script intentionally requires an authenticated application session and two
 * explicitly synthetic FAILED documents on a non-production preview:
 * - GUARD_DOCUMENT_ID: used for missing/malformed/mismatched checksum cases.
 * - RACE_DOCUMENT_ID: used for two concurrent matching-checksum requests.
 *
 * It never prints the session cookie. It refuses production domains and requires
 * MEDLUM_TEST_ALLOW_MUTATION=YES because the successful race request writes a
 * draft to the synthetic race document.
 *
 * Required environment:
 *   MEDLUM_TEST_BASE_URL
 *   MEDLUM_TEST_COOKIE       (Cookie header value from an authorized test session)
 *   MEDLUM_TEST_GUARD_DOCUMENT_ID
 *   MEDLUM_TEST_RACE_DOCUMENT_ID
 *   MEDLUM_TEST_SOURCE_CHECKSUM (SHA-256 hex for the same synthetic source file)
 *   MEDLUM_TEST_SYNTHETIC=YES
 *   MEDLUM_TEST_ALLOW_MUTATION=YES
 *
 * Run only with a dedicated test account and synthetic documents. Never use PHI.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const required = [
  "MEDLUM_TEST_BASE_URL",
  "MEDLUM_TEST_COOKIE",
  "MEDLUM_TEST_GUARD_DOCUMENT_ID",
  "MEDLUM_TEST_RACE_DOCUMENT_ID",
  "MEDLUM_TEST_SOURCE_CHECKSUM",
];
const missing = required.filter((key) => !String(process.env[key] || "").trim());
if (missing.length) {
  console.error("BLOCKED: missing required environment variables:", missing.join(", "));
  process.exit(2);
}
if (process.env.MEDLUM_TEST_SYNTHETIC !== "YES") {
  console.error("BLOCKED: set MEDLUM_TEST_SYNTHETIC=YES only after confirming both documents contain synthetic test data.");
  process.exit(2);
}
if (process.env.MEDLUM_TEST_ALLOW_MUTATION !== "YES") {
  console.error("BLOCKED: set MEDLUM_TEST_ALLOW_MUTATION=YES to allow one draft write on the synthetic race document.");
  process.exit(2);
}

const base = new URL(process.env.MEDLUM_TEST_BASE_URL);
const allowedHost = /^medlumhealthcare-[a-z0-9-]+\.vercel\.app$/i.test(base.hostname);
if (base.protocol !== "https:" || !allowedHost || /medlumhealth\.com|medlum-mvp\.vercel\.app/i.test(base.hostname)) {
  console.error("BLOCKED: this harness only permits HTTPS medlumhealthcare-*.vercel.app preview hosts; production is forbidden.");
  process.exit(2);
}
if (base.username || base.password || base.search || base.hash) {
  console.error("BLOCKED: base URL must not contain credentials, query parameters, or fragments.");
  process.exit(2);
}
const checksum = String(process.env.MEDLUM_TEST_SOURCE_CHECKSUM).trim().toLowerCase();
assert.match(checksum, /^[a-f0-9]{64}$/, "MEDLUM_TEST_SOURCE_CHECKSUM must be a SHA-256 hex digest");
assert.notEqual(
  process.env.MEDLUM_TEST_GUARD_DOCUMENT_ID,
  process.env.MEDLUM_TEST_RACE_DOCUMENT_ID,
  "Use two distinct synthetic FAILED documents so a failed guard test cannot consume the race fixture.",
);

const guardId = encodeURIComponent(process.env.MEDLUM_TEST_GUARD_DOCUMENT_ID);
const raceId = encodeURIComponent(process.env.MEDLUM_TEST_RACE_DOCUMENT_ID);
const endpoint = (id) => new URL(`/api/labs/documents/${id}/clinical-assist`, base).toString();
const syntheticText = [
  "SYNTHETIC QA REPORT — NOT A REAL PATIENT",
  "Hemoglobin: 13.5 g/dL",
  "Total WBC: 6500 cells/µL",
  "Platelets: 250000 cells/µL",
  "Glucose: 92 mg/dL",
].join("\n");

async function post(id, payload) {
  const response = await fetch(endpoint(id), {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      "X-MedLum-Requested-With": "MedLum",
      Cookie: process.env.MEDLUM_TEST_COOKIE,
    },
    body: JSON.stringify({ text: syntheticText, ...payload }),
  });
  const raw = await response.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = { nonJsonResponse: raw.slice(0, 160) };
  }
  if ([301, 302, 303, 307, 308].includes(response.status) || response.status === 401 && body?.nonJsonResponse) {
    throw new Error(`Request was redirected or intercepted before reaching the app (HTTP ${response.status}). Check Vercel preview access and the app session.`);
  }
  return { status: response.status, body };
}

function report(name, passed, detail) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) process.exitCode = 1;
}

console.log("Clinical Assist live acceptance");
console.log("Preview host:", base.hostname);
console.log("Synthetic fixtures:", "confirmed by explicit environment flag; IDs withheld");
console.log("Session cookie:", "[present; value withheld]");

const missingChecksum = await post(guardId, {});
report("missing checksum returns HTTP 400", missingChecksum.status === 400, `HTTP ${missingChecksum.status}`);

const malformedChecksum = await post(guardId, { sourceChecksum: "not-a-hash" });
report("malformed checksum returns HTTP 400", malformedChecksum.status === 400, `HTTP ${malformedChecksum.status}`);

let wrongChecksum = createHash("sha256").update("synthetic deliberately wrong source file").digest("hex");
if (wrongChecksum === checksum) {
  wrongChecksum = createHash("sha256").update("another synthetic wrong source file").digest("hex");
}
const mismatchedChecksum = await post(guardId, { sourceChecksum: wrongChecksum });
report(
  "mismatched checksum returns HTTP 409 without draft-change claim",
  mismatchedChecksum.status === 409 &&
    /No draft was changed/i.test(String(mismatchedChecksum.body?.error || "")),
  `HTTP ${mismatchedChecksum.status}`,
);

const concurrent = await Promise.all([
  post(raceId, { sourceChecksum: checksum, label: "Synthetic live acceptance", confidence: 99, partial: false }),
  post(raceId, { sourceChecksum: checksum, label: "Synthetic live acceptance", confidence: 99, partial: false }),
]);
const success = concurrent.find((result) => result.status === 200);
const conflict = concurrent.find((result) => result.status === 409);
report(
  "two concurrent matching requests yield exactly one success and one conflict",
  Boolean(success && conflict && concurrent.length === 2),
  concurrent.map((result) => result.status).sort().join(", "),
);

if (success) {
  const draft = success.body?.document?.ocrDraft;
  let parsedDraft = draft;
  if (typeof draft === "string") {
    try { parsedDraft = JSON.parse(draft); } catch { parsedDraft = null; }
  }
  report("successful response marks OCR as unverified", success.body?.ocr?.verified === false, `verified=${String(success.body?.ocr?.verified)}`);
  report("saved draft records verified=false", parsedDraft?.verified === false, `verified=${String(parsedDraft?.verified)}`);
  report("synthetic lab values produce DRAFT status", success.body?.ocr?.status === "DRAFT", `status=${String(success.body?.ocr?.status)}`);
}

if (process.exitCode) {
  console.error("Clinical Assist live acceptance FAILED. Do not merge PR #148 based on this run.");
  process.exit(process.exitCode);
}
console.log("Clinical Assist live acceptance PASSED. This does not replace broader security/compliance sign-off.");
