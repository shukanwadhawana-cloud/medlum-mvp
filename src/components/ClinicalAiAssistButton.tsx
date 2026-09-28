"use client";

import { useState } from "react";

export type ClinicalAiDraftFields = {
  chiefComplaint?: string;
  clinicalNotes?: string;
  history?: string;
  examination?: string;
  diagnosis?: string;
  assessment?: string;
  plan?: string;
  followUp?: string;
  medications?: string;
  allergies?: string;
  investigations?: string;
};

type Props = {
  getSource: () => {
    sourceText: string;
    existing?: Partial<ClinicalAiDraftFields>;
    patientContext?: { age?: number | string; gender?: string };
  };
  onDraft: (draft: ClinicalAiDraftFields, meta: { provider: string; offline: boolean }) => void;
  className?: string;
  label?: string;
};

/** Subtle clinical AI assist control. Draft-only: never auto-saves, signs, or creates orders. */
export default function ClinicalAiAssistButton({
  getSource,
  onDraft,
  className = "",
  label = "AI Assist",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastMeta, setLastMeta] = useState<{ provider: string; offline: boolean } | null>(null);

  async function requestDraft() {
    setBusy(true);
    setError("");
    try {
      const payload = getSource();
      if (
        !payload.sourceText?.trim() &&
        !(payload.existing && Object.values(payload.existing).some((v) => String(v || "").trim()))
      ) {
        setError("Enter or dictate clinical notes first, then use AI Assist.");
        return;
      }
      const res = await fetch("/api/clinical-ai/draft", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not generate AI draft");
      }
      const draft = (data.draft || {}) as ClinicalAiDraftFields;
      const meta = {
        provider: String(data.provider || "heuristic"),
        offline: Boolean(data.offline),
      };
      setLastMeta(meta);
      onDraft(draft, meta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate AI draft");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void requestDraft()}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        title="Generate structured AI DRAFT from your notes. You review and save."
      >
        {busy ? "Generating draft…" : label}
      </button>
      {lastMeta && (
        <span className="text-[10px] text-slate-500">
          AI Draft ({lastMeta.offline ? "offline" : lastMeta.provider}) — review before save
        </span>
      )}
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
