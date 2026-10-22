"use client";

import { useEffect, useState } from "react";

type Question = { id: string; label: string; group: string };
type AnswerPayload = {
  success?: boolean;
  error?: string;
  questionId?: string;
  answer?: string;
  sources?: Array<{ label: string; at: string; title: string }>;
  disclaimer?: string;
  generatedAt?: string;
};

const QUESTIONS: Question[] = [
  {
    "id": "antibiotic-day",
    "label": "What day of antibiotic therapy is this?",
    "group": "Medication & MAR"
  },
  {
    "id": "last-antibiotic-dose",
    "label": "When was the last antibiotic dose administered?",
    "group": "Medication & MAR"
  },
  {
    "id": "missed-doses",
    "label": "Were any doses held, omitted, refused or delayed?",
    "group": "Medication & MAR"
  },
  {
    "id": "current-medications",
    "label": "What medications are currently prescribed?",
    "group": "Medication & MAR"
  },
  {
    "id": "mar-last-24h",
    "label": "Which medications were actually administered in the last 24 hours?",
    "group": "Medication & MAR"
  },
  {
    "id": "pending-doses",
    "label": "Which medication doses are overdue or still unconfirmed?",
    "group": "Medication & MAR"
  },
  {
    "id": "antibiotic-review",
    "label": "Summarize antibiotic orders, administered doses and related culture results",
    "group": "Medication & MAR"
  },
  {
    "id": "medication-reconciliation",
    "label": "Compare prescription orders with MAR documentation for review",
    "group": "Medication & MAR"
  },
  {
    "id": "creatinine-trend",
    "label": "Show the creatinine trend since admission",
    "group": "Investigations & diagnostics"
  },
  {
    "id": "latest-labs",
    "label": "What are the latest laboratory results?",
    "group": "Investigations & diagnostics"
  },
  {
    "id": "pending-investigations",
    "label": "Which investigations are still pending?",
    "group": "Investigations & diagnostics"
  },
  {
    "id": "cbc-results",
    "label": "Show the latest documented CBC / blood count results",
    "group": "Investigations & diagnostics"
  },
  {
    "id": "hemoglobin-trend",
    "label": "Show the hemoglobin / Hb trend",
    "group": "Investigations & diagnostics"
  },
  {
    "id": "wbc-trend",
    "label": "Show the WBC / TLC trend",
    "group": "Investigations & diagnostics"
  },
  {
    "id": "electrolyte-trend",
    "label": "Show recorded sodium, potassium and other electrolyte results",
    "group": "Investigations & diagnostics"
  },
  {
    "id": "glucose-results",
    "label": "Show recent glucose / blood sugar results",
    "group": "Investigations & diagnostics"
  },
  {
    "id": "abnormal-labs",
    "label": "Which results are explicitly flagged high, low, abnormal or critical?",
    "group": "Investigations & diagnostics"
  },
  {
    "id": "latest-imaging",
    "label": "Summarize the latest imaging / diagnostic reports",
    "group": "Investigations & diagnostics"
  },
  {
    "id": "microbiology-results",
    "label": "Show documented cultures, microbiology and sensitivity results",
    "group": "Investigations & diagnostics"
  },
  {
    "id": "infection-workup",
    "label": "Summarize the documented infection work-up and antibiotic records",
    "group": "Investigations & diagnostics"
  },
  {
    "id": "latest-vitals",
    "label": "Show the latest recorded vital signs",
    "group": "Patient progress & handover"
  },
  {
    "id": "last-24-hours",
    "label": "Summarize the documented events in the last 24 hours",
    "group": "Patient progress & handover"
  },
  {
    "id": "allergies-diagnosis",
    "label": "What allergies and diagnoses are documented?",
    "group": "Safety & care planning"
  },
  {
    "id": "latest-assessment-plan",
    "label": "What is the latest documented clinical assessment and plan?",
    "group": "Patient progress & handover"
  },
  {
    "id": "latest-note",
    "label": "Show the most recent clinical notes and their recorded status",
    "group": "Patient progress & handover"
  },
  {
    "id": "nursing-observations",
    "label": "What nursing observations were recorded in the last 24 hours?",
    "group": "Patient progress & handover"
  },
  {
    "id": "latest-handover",
    "label": "Show the latest documented clinical handover",
    "group": "Patient progress & handover"
  },
  {
    "id": "patient-round-summary",
    "label": "Prepare a chart-only summary for the next ward round",
    "group": "Patient progress & handover"
  },
  {
    "id": "cognition-delirium",
    "label": "What confusion, cognition or consciousness observations are documented?",
    "group": "Patient progress & handover"
  },
  {
    "id": "goals-escalation",
    "label": "What escalation, resuscitation or goals-of-care documentation is present?",
    "group": "Patient progress & handover"
  },
  {
    "id": "discharge-plan",
    "label": "What discharge, transfer or follow-up plans are documented?",
    "group": "Safety & care planning"
  },
  {
    "id": "devices-lines",
    "label": "What lines, tubes, catheters or respiratory support are mentioned in notes?",
    "group": "Safety & care planning"
  },
  {
    "id": "urine-output",
    "label": "What urine-output or fluid-balance information is documented?",
    "group": "Safety & care planning"
  },
  {
    "id": "nutrition-plan",
    "label": "What diet, feeding or nutrition plan is documented?",
    "group": "Supportive care"
  },
  {
    "id": "mobility-safety",
    "label": "What mobility, falls or pressure-injury prevention notes are documented?",
    "group": "Supportive care"
  },
  {
    "id": "pain-assessment",
    "label": "What pain assessments and pain-management notes are documented?",
    "group": "Supportive care"
  },
  {
    "id": "vte-prophylaxis",
    "label": "Is VTE prophylaxis mentioned in the chart or medication orders?",
    "group": "Safety & care planning"
  }
];

export default function ClinicalQAPanel({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [busyId, setBusyId] = useState("");
  const [activeQuestion, setActiveQuestion] = useState("");
  const [result, setResult] = useState<AnswerPayload | null>(null);
  const [error, setError] = useState("");
  const [questionSearch, setQuestionSearch] = useState("");

  useEffect(() => {
    setResult(null);
    setActiveQuestion("");
    setError("");
    setBusyId("");
  }, [patientId]);

  async function ask(question: Question) {
    if (!patientId || busyId) return;
    setBusyId(question.id);
    setActiveQuestion(question.id);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/ipd/" + encodeURIComponent(patientId) + "/clinical-qa", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as AnswerPayload;
      if (!response.ok || !payload.success) throw new Error(payload.error || "Could not retrieve an answer from the chart.");
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Clinical Q&A is temporarily unavailable.");
    } finally {
      setBusyId("");
    }
  }

  const normalizedSearch = questionSearch.trim().toLowerCase();
  const visibleQuestions = QUESTIONS.filter((question) =>
    !normalizedSearch || (question.label + " " + question.group).toLowerCase().includes(normalizedSearch),
  );
  const groups = [...new Set(visibleQuestions.map((question) => question.group))];

  return (
    <section className="space-y-4" aria-labelledby="clinical-qa-heading">
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-800">Patient chart assistant</p>
            <h3 id="clinical-qa-heading" className="mt-1 text-base font-semibold text-gray-950">Clinical Q&amp;A</h3>
            <p className="mt-1 text-xs text-gray-600">Ask about <span className="font-semibold">{patientName}</span> using preset questions backed by this patient's recorded chart.</p>
          </div>
          <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-violet-800">Read-only · no external AI call</span>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-gray-600">
          Answers are calculated from the chart and include source records. A prescription is not proof of administration. Missing or incomplete chart entries can produce incomplete answers; verify before acting.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="clinical-qa-question-search" className="block text-[11px] font-semibold text-gray-700">Find a clinical question</label>
        <input id="clinical-qa-question-search" type="search" value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} placeholder="Search medication, labs, handover, discharge…" className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200" />
        <p className="text-[10px] text-gray-500" aria-live="polite">{visibleQuestions.length} of {QUESTIONS.length} questions</p>
      </div>

      {groups.map((group) => (
        <div key={group} className="space-y-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{group}</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {visibleQuestions.filter((question) => question.group === group).map((question) => (
              <button
                key={question.id}
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => void ask(question)}
                className={"min-h-11 rounded-xl border bg-white px-3 py-2 text-left text-xs font-medium text-gray-800 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-wait disabled:opacity-60 " +
                  (activeQuestion === question.id ? "border-violet-400 ring-1 ring-violet-200" : "border-gray-200")}
              >
                <span className="mr-2 text-violet-700" aria-hidden="true">{busyId === question.id ? "…" : "↗"}</span>
                {question.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {visibleQuestions.length === 0 && <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">No questions match that search. Try a medicine, investigation or care-plan keyword.</p>}

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div>}

      {result?.answer && (
        <div className="overflow-hidden rounded-xl border border-violet-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-violet-50/60 px-3 py-2">
            <h4 className="text-xs font-semibold text-gray-900">Answer from the patient chart</h4>
            <span className="text-[10px] text-gray-500">{result.generatedAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(result.generatedAt)) : "Just now"}</span>
          </div>
          <pre className="whitespace-pre-wrap break-words p-3 font-sans text-xs leading-relaxed text-gray-800">{result.answer}</pre>
          {result.sources && result.sources.length > 0 && (
            <div className="border-t bg-gray-50 px-3 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Source records</p>
              <div className="space-y-1.5">
                {result.sources.map((item, index) => (
                  <div key={item.label + "-" + item.at + "-" + index} className="flex items-start gap-2 text-[10px] text-gray-600">
                    <span className="mt-0.5 text-violet-700" aria-hidden="true">•</span>
                    <div className="min-w-0">
                      <span className="font-semibold text-gray-800">{item.label}</span>{item.title && item.title !== item.label ? " · " + item.title : ""}
                      <p className="mt-0.5">{item.at}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="border-t px-3 py-2 text-[10px] leading-relaxed text-amber-800">{result.disclaimer || "Verify the source chart before clinical decisions."}</p>
        </div>
      )}
      <p className="text-[10px] text-gray-400">Clinical Q&amp;A is separate from MedLum Help and never sends patient chart content to the support chat.</p>
    </section>
  );
}
