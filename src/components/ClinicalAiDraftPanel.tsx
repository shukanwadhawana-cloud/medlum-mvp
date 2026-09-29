"use client";

import { useState } from "react";

export type AiDraftSections = {
  history: string;
  examination: string;
  assessment: string;
  plan: string;
  followUp: string;
  patientInstructions: string;
  combined: string;
  source?: string;
  disclaimer?: string;
};

type Props = {
  /** Existing patient id. Empty / omitted for new-patient drafts. */
  patientId?: string;
  encounterId?: string;
  patientName?: string;
  age?: string | number;
  gender?: string;
  allergies?: string;
  chiefComplaint?: string;
  clinicalNotes?: string;
  diagnosis?: string;
  assessment?: string;
  plan?: string;
  bp?: string;
  onApply: (draft: AiDraftSections) => void;
};

/**
 * Mobile-first AI draft assist. Generates an editable draft only.
 * Never finalizes clinical notes.
 * Works for existing patients (facility lookup) and new patients (form context only).
 */
export default function ClinicalAiDraftPanel({
  patientId,
  encounterId,
  patientName,
  age,
  gender,
  allergies,
  chiefComplaint,
  clinicalNotes,
  diagnosis,
  assessment,
  plan,
  bp,
  onApply,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<AiDraftSections | null>(null);

  const hasFormContext = Boolean(
    (clinicalNotes && clinicalNotes.trim()) ||
      (chiefComplaint && chiefComplaint.trim()) ||
      (diagnosis && diagnosis.trim()) ||
      (assessment && assessment.trim()) ||
      (plan && plan.trim()),
  );
  const realPatientId = patientId && patientId !== "new" ? patientId : "";
  const canGenerate = Boolean(realPatientId || hasFormContext);

  async function generate() {
    if (!canGenerate || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/clinical-ai/draft", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-MedLum-Requested-With": "MedLum",
        },
        body: JSON.stringify({
          ...(realPatientId ? { patientId: realPatientId } : {}),
          encounterId: encounterId || undefined,
          patientName: patientName || undefined,
          age: age != null && String(age).trim() ? String(age) : undefined,
          gender: gender || undefined,
          allergies: allergies || undefined,
          chiefComplaint,
          clinicalNotes,
          diagnosis,
          assessment,
          plan,
          bp: bp || undefined,
          noteType: "Progress Note",
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success || !j.draft) {
        throw new Error(j.error || "Could not generate draft.");
      }
      setDraft(j.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate draft.");
    } finally {
      setBusy(false);
    }
  }

  function reject() {
    setDraft(null);
    setError("");
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">AI documentation draft</h3>
          <p className="mt-0.5 text-[11px] text-gray-600">
            Generates an editable draft only. You must review and edit before saving. AI cannot sign or finalize notes.
            {!realPatientId && (
              <span className="block mt-0.5 text-amber-800">
                New patient mode: draft uses the notes you typed or OCR text. Save the patient to keep a permanent record.
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={!canGenerate || busy}
          onClick={() => void generate()}
          className="h-9 shrink-0 rounded-lg bg-[#140a1f] px-3 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Generating…" : draft ? "Regenerate draft" : "Generate AI draft"}
        </button>
      </div>

      {!canGenerate && (
        <p className="mt-2 text-xs text-amber-800">
          Select an existing patient, or add chief complaint / clinical notes (or run OCR) before generating a draft.
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      {draft && (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            AI-generated draft · not a final clinical record
            {draft.source ? ` · source: ${draft.source}` : ""}
          </p>
          {draft.disclaimer && <p className="text-[10px] text-gray-500">{draft.disclaimer}</p>}
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 p-2 text-[11px] text-gray-800">
            {draft.combined}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onApply(draft)}
              className="h-9 rounded-lg bg-[#c2183a] px-3 text-xs font-semibold text-white"
            >
              Use draft in form
            </button>
            <button type="button" onClick={reject} className="h-9 rounded-lg border px-3 text-xs font-semibold">
              Discard draft
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
