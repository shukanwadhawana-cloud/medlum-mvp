"use client";

import { useState } from "react";

export type ClinicalAiDraftFields = {
  chiefComplaint?: string;
  clinicalNotes?: string;
  diagnosis?: string;
  assessment?: string;
  plan?: string;
};

type Props = {
  /** Free-text notes/dictation used as AI input (no PHI identifiers required). */
  sourceText: string;
  age?: number;
  gender?: string;
  disabled?: boolean;
  onDraft: (draft: ClinicalAiDraftFields, meta: { source: string; notice: string }) => void;
  onError?: (message: string) => void;
};

/**
 * Clinical AI Assist control — generates a DRAFT only.
 * Parent applies fields after doctor review context; never auto-saves.
 */
export default function ClinicalAiAssistButton({ sourceText, age, gender, disabled, onDraft, onError }: Props) {
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!String(sourceText || "").trim()) {
      onError?.("Add notes or dictate first, then run Clinical AI Assistant.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/clinical-ai/draft", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText, age, gender }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || "Could not generate AI draft.");
      onDraft(body.draft || {}, {
        source: String(body.source || "draft"),
        notice:
          body.notice ||
          "AI DRAFT applied. Review and edit before saving. Nothing is finalized.",
      });
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not generate AI draft.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => void run()}
      className="rounded-xl border border-[#140a1f]/20 bg-[#f6f4f8] px-3 py-2 text-xs font-medium text-[#140a1f] disabled:opacity-50"
    >
      {busy ? "Drafting…" : "AI Assist"}
    </button>
  );
}
