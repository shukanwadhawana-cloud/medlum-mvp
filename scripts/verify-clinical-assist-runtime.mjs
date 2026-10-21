#!/usr/bin/env node
/**
 * HTTP integration acceptance for the actual Next.js Clinical Assist route.
 * This is executed by CI against an ephemeral PostgreSQL database with synthetic fixtures.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const base = (process.env.MEDLUM_RUNTIME_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const secretText = process.env.SESSION_SECRET || "";
assert.ok(secretText.length >= 32, "CI SESSION_SECRET must be at least 32 characters");

const IDS = {
  doctorA: "ci_ca_doctor_a",
  doctorB: "ci_ca_doctor_b",
  doctorNoClinic: "ci_ca_doctor_no_clinic",
  doctorWrongRole: "ci_ca_doctor_wrong_role",
  guardDoc: "ci_ca_guard_document",
  raceDoc: "ci_ca_race_document",
  foreignDoc: "ci_ca_foreign_document",
};
const EMAILS = {
  [IDS.doctorA]: "clinical-assist-ci-a@example.invalid",
  [IDS.doctorB]: "clinical-assist-ci-b@example.invalid",
  [IDS.doctorNoClinic]: "clinical-assist-ci-none@example.invalid",
  [IDS.doctorWrongRole]: "clinical-assist-ci-role@example.invalid",
};
const SOURCE = "MEDLUM CI SYNTHETIC REPORT SOURCE FILE — NOT A REAL PATIENT\nFixture: clinical-assist-checksum-v1\n";
const checksum = createHash("sha256").update(SOURCE, "utf8").digest("hex");
const reportText = [
  "SYNTHETIC QA REPORT — NOT A REAL PATIENT",
  "Hemoglobin: 13.5 g/dL",
  "Total WBC: 6500 cells/µL",
  "Platelets: 250000 cells/µL",
  "Glucose: 92 mg/dL",
].join("\n");
const prisma = new PrismaClient();

async function sessionCookie(doctorId) {
  const token = await new SignJWT({ doctorId, email: EMAILS[doctorId] })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(secretText));
  return `medlum_session=${token}`;
}
async function post(docId, payload = {}, doctorId = IDS.doctorA) {
  const response = await fetch(`${base}/api/labs/documents/${encodeURIComponent(docId)}/clinical-assist`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      "X-MedLum-Requested-With": "MedLum",
      Origin: base,
      Referer: `${base}/`,
      ...(doctorId ? { Cookie: await sessionCookie(doctorId) } : {}),
    },
    body: JSON.stringify({ text: reportText, ...payload }),
  });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = { raw: raw.slice(0, 200) }; }
  assert.ok(![301,302,303,307,308].includes(response.status), `unexpected redirect HTTP ${response.status}`);
  assert.ok(typeof body === "object", "response should be JSON");
  return { status: response.status, body };
}
function check(name, condition, detail = "") {
  assert.ok(condition, `FAIL ${name}${detail ? `: ${detail}` : ""}`);
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}

try {
  console.log("Clinical Assist route integration acceptance (ephemeral CI database)");
  console.log("Target:", new URL(base).origin);
  const unauthenticated = await post(IDS.guardDoc, {}, null);
  check("no session is rejected before document mutation", unauthenticated.status === 401, `HTTP ${unauthenticated.status}`);

  const missing = await post(IDS.guardDoc, {});
  check("missing source checksum returns 400", missing.status === 400, `HTTP ${missing.status}`);

  const malformed = await post(IDS.guardDoc, { sourceChecksum: "not-a-hash" });
  check("malformed source checksum returns 400", malformed.status === 400, `HTTP ${malformed.status}`);

  let wrongDigest = createHash("sha256").update("definitely another synthetic file").digest("hex");
  if (wrongDigest === checksum) wrongDigest = createHash("sha256").update("yet another synthetic file").digest("hex");
  const mismatched = await post(IDS.guardDoc, { sourceChecksum: wrongDigest });
  check("valid-format mismatched checksum returns 409", mismatched.status === 409 && /No draft was changed/i.test(String(mismatched.body.error || "")), `HTTP ${mismatched.status}`);

  const unchanged = await prisma.medicalDocument.findUnique({ where: { id: IDS.guardDoc } });
  check("rejected checksum attempts leave document FAILED and draft untouched", unchanged?.ocrStatus === "FAILED" && unchanged?.ocrDraft === "" && unchanged?.ocrExtractedAt === null);

  const noMembership = await post(IDS.guardDoc, {}, IDS.doctorNoClinic);
  check("authenticated account without clinic membership is denied", noMembership.status === 403, `HTTP ${noMembership.status}`);

  const wrongRole = await post(IDS.guardDoc, {}, IDS.doctorWrongRole);
  check("authenticated account with disallowed role is denied", wrongRole.status === 403, `HTTP ${wrongRole.status}`);

  const crossClinic = await post(IDS.foreignDoc, {}, IDS.doctorA);
  check("document from another clinic is not discoverable", crossClinic.status === 404, `HTTP ${crossClinic.status}`);

  const matching = await post(IDS.guardDoc, { sourceChecksum: checksum, label: "Synthetic CI Clinical Assist", confidence: 99, partial: false });
  check("matching checksum saves a draft", matching.status === 200 && matching.body.success === true, `HTTP ${matching.status}`);
  check("successful response keeps OCR unverified", matching.body.ocr?.verified === false);
  check("successful response parses synthetic lab candidates", matching.body.ocr?.status === "DRAFT");
  let responseDraft = matching.body.document?.ocrDraft;
  if (typeof responseDraft === "string") responseDraft = JSON.parse(responseDraft);
  check("persisted draft stays verified=false", responseDraft?.verified === false);
  const persisted = await prisma.medicalDocument.findUnique({ where: { id: IDS.guardDoc } });
  let persistedDraft = {};
  try { persistedDraft = JSON.parse(persisted?.ocrDraft || "{}"); } catch {}
  check("database persists draft only, not verified clinical truth", persisted?.ocrStatus === "DRAFT" && persistedDraft.verified === false && persisted?.verifiedAt === null);

  const concurrent = await Promise.all([
    post(IDS.raceDoc, { sourceChecksum: checksum, label: "Synthetic concurrent CI request A", confidence: 99, partial: false }),
    post(IDS.raceDoc, { sourceChecksum: checksum, label: "Synthetic concurrent CI request B", confidence: 99, partial: false }),
  ]);
  const statuses = concurrent.map((item) => item.status).sort((a,b) => a-b);
  check("compare-and-set allows only one concurrent draft update", statuses[0] === 200 && statuses[1] === 409, `HTTP ${statuses.join(", ")}`);
  const racePersisted = await prisma.medicalDocument.findUnique({ where: { id: IDS.raceDoc } });
  let raceDraft = {};
  try { raceDraft = JSON.parse(racePersisted?.ocrDraft || "{}"); } catch {}
  check("concurrent test leaves one unverified draft", racePersisted?.ocrStatus === "DRAFT" && raceDraft.verified === false);

  console.log("ALL CLINICAL ASSIST RUNTIME ACCEPTANCE CHECKS PASSED");
} catch (error) {
  console.error("Clinical Assist runtime acceptance failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
