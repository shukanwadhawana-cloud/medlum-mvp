#!/usr/bin/env node
/**
 * Runtime acceptance for the longitudinal IPD case-summary endpoint.
 * Uses only synthetic fixtures on the ephemeral CI PostgreSQL database.
 */
import assert from "node:assert/strict";
import { SignJWT } from "jose";

const base = (process.env.MEDLUM_RUNTIME_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const secretText = process.env.SESSION_SECRET || "";
assert.ok(secretText.length >= 32, "CI SESSION_SECRET must be at least 32 characters");

const ownerId = "ci_ca_owner_a";
const ownerEmail = "password-reset-owner@example.invalid";
const patientId = "ci_ca_case_patient";
const otherClinicPatientId = "ci_ca_patient_b";

async function sessionCookie(doctorId, email) {
  const token = await new SignJWT({ doctorId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(secretText));
  return "medlum_session=" + token;
}
async function post(patient, cookie) {
  const headers = {
    "content-type": "application/json",
    origin: base,
    "x-medlum-requested-with": "MedLum",
  };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(base + "/api/ipd/" + encodeURIComponent(patient) + "/case-summary", {
    method: "POST",
    headers,
    body: "{}",
    redirect: "manual",
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function main() {
  const unauthenticated = await post(patientId);
  assert.equal(unauthenticated.response.status, 401, "case summary requires an authenticated session");

  const cookie = await sessionCookie(ownerId, ownerEmail);
  const generated = await post(patientId, cookie);
  assert.equal(generated.response.status, 200, "authorized clinic owner can generate a case summary");
  assert.equal(generated.body.success, true, "case summary endpoint reports success");
  assert.equal(generated.body.finalized, false, "summary is always an unsigned draft");
  assert.equal(generated.body.noteId, null, "generation does not save or sign a note");
  assert.equal(generated.body.draft.source, "timeline", "synthetic CI forces deterministic non-provider summary mode");

  const content = String(generated.body.draft.content || "");
  assert.ok(content.length > 500, "summary includes substantive chronology");
  assert.match(content, /01 October 2026/, "summary starts with the admission day");
  assert.match(content, /02 October 2026/, "summary includes day 2");
  assert.match(content, /03 October 2026/, "summary includes the discharge day");
  assert.match(content, /fever and productive cough/i, "admission complaints are included");
  assert.match(content, /118\/76|104|38\.4 C/, "admission vitals are included");
  assert.match(content, /Hemoglobin 9\.8 g\/dL/, "lab result is included");
  assert.match(content, /mild right basal opacity/i, "diagnostic findings are included");
  assert.match(content, /Synthetic ceftriaxone/i, "prescription/medication information is included");
  assert.match(content, /ADMINISTERED/, "MAR administration status is included separately");
  assert.match(content, /fall precautions maintained/i, "nursing precaution is included");
  assert.match(content, /Synthetic receiving team/i, "handover is included");
  assert.match(content, /Discharge completed/i, "documented discharge event is included");
  assert.ok(generated.body.draft.dayCount >= 3, "daily chronology spans all admission dates");
  assert.ok(generated.body.draft.eventCount >= 8, "summary includes source events from multiple chart domains");
  assert.ok(generated.body.draft.sourceCounts["Clinical notes (excluding previous case summaries)"] >= 3, "clinical note records are counted");
  assert.ok(generated.body.draft.sourceCounts["Lab orders/results"] >= 1, "laboratory data source is counted");
  assert.ok(generated.body.draft.sourceCounts["Medication administration (MAR)"] >= 1, "MAR data source is counted");

  const crossClinic = await post(otherClinicPatientId, cookie);
  assert.equal(crossClinic.response.status, 404, "summary endpoint does not expose another clinic's patient");

  console.log("Longitudinal IPD case-summary HTTP acceptance: PASS (synthetic PostgreSQL; no real patient data)");
}
main().catch((error) => {
  console.error("Longitudinal IPD case-summary runtime acceptance FAILED:", error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
