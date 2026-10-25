export type ClinicalSignatureMode = "AUTHOR_SIGNATURE" | "VERIFIER";

export function buildClinicalSignaturePayload(input: {
  content: string;
  authorDoctorId: string;
  signerDoctorId: string;
  noteId: string;
  mode: ClinicalSignatureMode;
}) {
  const signerLabel = input.mode === "AUTHOR_SIGNATURE" ? "AUTHOR_SIGNATURE" : "VERIFIER";
  return `${input.content}\nAUTHOR:${input.authorDoctorId}\n${signerLabel}:${input.signerDoctorId}\nNOTE:${input.noteId}`;
}
