"use client";

import { useState } from "react";
import { apiCreateEncounter } from "@/lib/api";
import { formatIst } from "@/lib/time";

const NOTE_TYPES = [
  "Progress Note",
  "Consultant Note",
  "RMO Note",
  "Nursing Care Note",
  "Procedure Note",
  "Case Summary",
];

export function ClinicalNotesPanel({
  patientId,
  encounters,
  onSaved,
}: {
  patientId: string;
  encounters: any[];
  onSaved: () => Promise<void> | void;
}) {
  const [noteType, setNoteType] = useState(NOTE_TYPES[0]);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [assessment, setAssessment] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [plan, setPlan] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!clinicalNotes.trim() && !assessment.trim() && !diagnosis.trim() && !plan.trim()) {
      setErr("Enter at least one of: notes, assessment, diagnosis, or plan.");
      return;
    }
    setSaving(true);
    try {
      const body = [
        noteType ? `Note type: ${noteType}` : "",
        clinicalNotes.trim(),
      ]
        .filter(Boolean)
        .join("\n");
      const res = await apiCreateEncounter({
        patientId,
        chiefComplaint: chiefComplaint.trim() || noteType,
        clinicalNotes: body,
        assessment: assessment.trim(),
        diagnosis: diagnosis.trim(),
        plan: plan.trim(),
      });
      if (!res.success) {
        setErr(res.error || "Could not save note");
        return;
      }
      setMsg("Clinical note saved.");
      setChiefComplaint("");
      setClinicalNotes("");
      setAssessment("");
      setDiagnosis("");
      setPlan("");
      await onSaved();
    } catch {
      setErr("Network error while saving note");
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...encounters].sort((a, b) => {
    const ta = new Date(a.createdAt || a.date || 0).getTime();
    const tb = new Date(b.createdAt || b.date || 0).getTime();
    return tb - ta;
  });

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Add clinical note
          </h3>
        </div>
        <form onSubmit={save} className="space-y-2.5 p-3">
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
          {msg && <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{msg}</div>}
          <label className="block text-[11px] font-medium text-gray-600">
            Note type
            <select
              value={noteType}
              onChange={(e) => setNoteType(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
            >
              {NOTE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-gray-600">
            Chief complaint (optional)
            <input
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
              placeholder="Presenting complaint"
            />
          </label>
          <label className="block text-[11px] font-medium text-gray-600">
            Clinical notes
            <textarea
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              className="mt-1 min-h-[5rem] w-full rounded-lg border px-2 py-2 text-sm"
              placeholder="Status, events, findings, response…"
            />
          </label>
          <label className="block text-[11px] font-medium text-gray-600">
            Assessment
            <textarea
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              className="mt-1 min-h-[3rem] w-full rounded-lg border px-2 py-2 text-sm"
            />
          </label>
          <label className="block text-[11px] font-medium text-gray-600">
            Diagnosis
            <input
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
            />
          </label>
          <label className="block text-[11px] font-medium text-gray-600">
            Plan
            <textarea
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="mt-1 min-h-[3rem] w-full rounded-lg border px-2 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="h-10 w-full rounded-lg bg-[#c2183a] text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save clinical note"}
          </button>
          <p className="text-[11px] text-gray-400">
            Saved as a clinical encounter. Author is the signed-in staff member (server session).
          </p>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Documentation history (IST)
          </h3>
        </div>
        <div className="max-h-[32rem] space-y-2 overflow-auto p-3">
          {sorted.length === 0 ? (
            <p className="py-2 text-xs text-gray-400">No clinical notes yet.</p>
          ) : (
            sorted.map((e: any) => (
              <article key={e.id} className="rounded-lg border p-3 text-xs">
                <div className="mb-1 flex flex-wrap justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {e.date || formatIst(e.createdAt, { dateOnly: true })}
                  </span>
                  <span className="text-gray-500">{formatIst(e.createdAt)}</span>
                </div>
                {e.chiefComplaint && (
                  <p>
                    <b>Chief complaint:</b> {e.chiefComplaint}
                  </p>
                )}
                {e.clinicalNotes && (
                  <p className="mt-1 whitespace-pre-wrap">
                    <b>Notes:</b> {e.clinicalNotes}
                  </p>
                )}
                {e.assessment && (
                  <p className="mt-1 whitespace-pre-wrap">
                    <b>Assessment:</b> {e.assessment}
                  </p>
                )}
                {e.diagnosis && (
                  <p className="mt-1">
                    <b>Diagnosis:</b> {e.diagnosis}
                  </p>
                )}
                {e.plan && (
                  <p className="mt-1 whitespace-pre-wrap">
                    <b>Plan:</b> {e.plan}
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
