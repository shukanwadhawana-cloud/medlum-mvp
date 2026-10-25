import assert from "node:assert/strict";
import { buildClinicalSignaturePayload } from "../src/lib/clinical-signature-payload";

const author = buildClinicalSignaturePayload({
  content: "Assessment: stable",
  authorDoctorId: "doctor-1",
  signerDoctorId: "doctor-1",
  noteId: "note-1",
  mode: "AUTHOR_SIGNATURE",
});
assert.equal(
  author,
  "Assessment: stable\nAUTHOR:doctor-1\nAUTHOR_SIGNATURE:doctor-1\nNOTE:note-1",
  "author signature payload uses real newline delimiters and canonical field order",
);

const verifier = buildClinicalSignaturePayload({
  content: "Assessment: stable",
  authorDoctorId: "doctor-1",
  signerDoctorId: "doctor-2",
  noteId: "note-1",
  mode: "VERIFIER",
});
assert.equal(
  verifier,
  "Assessment: stable\nAUTHOR:doctor-1\nVERIFIER:doctor-2\nNOTE:note-1",
  "independent verifier payload uses the same delimiters and canonical field order",
);
assert.notEqual(author, verifier, "author and verifier signatures cannot share the same payload");
assert.ok(!author.includes("\\\\n"), "payload contains newline characters, not literal backslash-n text");
console.log("Canonical clinical signature payload runtime checks passed.");
