"use client";

import { useMemo, useState } from "react";
import { apiCreateEncounter } from "@/lib/api";
import { formatIst } from "@/lib/time";

const NOTE_TYPES = [
  "Progress Note",
  "Consultant Note",
  "RMO Note",
  "Nursing Care Note",
  "Procedure Note",
  "Case Summary",
  "Referral / Consult",
  "Discharge Note",
];

type IoRow = {
  id: string;
  kind: "intake" | "output";
  category: string;
  volumeMl: string;
  notes: string;
  at: string;
};

function parseIoFromEncounters(encounters: any[]): IoRow[] {
  const rows: IoRow[] = [];
  for (const e of encounters) {
    const raw = String(e.clinicalNotes || "");
    const m = raw.match(/__MEDLUM_IO__:(\{[^}\n]*\})/);
    if (!m) continue;
    try {
      const j = JSON.parse(m[1]) as { kind?: string; category?: string; volumeMl?: string; notes?: string };
      if (j.kind !== "intake" && j.kind !== "output") continue;
      rows.push({
        id: e.id,
        kind: j.kind,
        category: j.category || "",
        volumeMl: j.volumeMl || "",
        notes: j.notes || "",
        at: e.createdAt,
      });
    } catch {
      /* Ignore malformed legacy markers. */
    }
  }
  return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function ClinicalNotesPanel({
  patientId,
  encounters,
  labs = [],
  diagnostics = [],
  prescriptions = [],
  profile = {},
  onSaved,
}: {
  patientId: string;
  encounters: any[];
  labs?: any[];
  diagnostics?: any[];
  prescriptions?: any[];
  profile?: Record<string, string>;
  onSaved: () => Promise<void> | void;
}) {
  const [noteType, setNoteType] = useState(NOTE_TYPES[0]);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [assessment, setAssessment] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [plan, setPlan] = useState("");
  const [selectedLabs, setSelectedLabs] = useState<string[]>([]);
  const [selectedDiagnostics, setSelectedDiagnostics] = useState<string[]>([]);
  const [selectedPrescriptions, setSelectedPrescriptions] = useState<string[]>([]);
  const [pullVitals, setPullVitals] = useState(true);
  const [pullIo, setPullIo] = useState(false);
  const [pullProblems, setPullProblems] = useState(true);
  const [pullRecentNotes, setPullRecentNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const latestVitals = useMemo(
    () =>
      encounters.find(
        (e) => e.bp || e.pulse || e.temperature || e.spo2 || e.weight || e.height
      ),
    [encounters]
  );
  const ioRows = useMemo(() => parseIoFromEncounters(encounters), [encounters]);
  const selectedLabRows = useMemo(
    () => labs.filter((l) => selectedLabs.includes(l.id)),
    [labs, selectedLabs]
  );
  const selectedDiagnosticRows = useMemo(
    () => diagnostics.filter((d) => selectedDiagnostics.includes(d.id)),
    [diagnostics, selectedDiagnostics]
  );
  const selectedPrescriptionRows = useMemo(
    () => prescriptions.filter((r) => selectedPrescriptions.includes(r.id)),
    [prescriptions, selectedPrescriptions]
  );

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) =>
    setter((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);

  const appendToNote = (label: string, lines: string[]) => {
    const block = [`[Pulled from chart · ${label}]`, ...lines.filter(Boolean)].join("\n");
    setClinicalNotes((current) => current.trim() ? `${current.trim()}\n\n${block}` : block);
  };

  const pullSelected = () => {
    const blocks: string[] = [];

    if (pullProblems) {
      const problem = profile.workingDiagnosis || profile.diagnosis || encounters[0]?.diagnosis;
      const complaint = profile.chiefComplaint || encounters[0]?.chiefComplaint;
      if (problem || complaint) {
        blocks.push([
          "[Problems / diagnosis]",
          complaint ? `Chief complaint: ${complaint}` : "",
          problem ? `Working diagnosis: ${problem}` : "",
        ].filter(Boolean).join("\n"));
      }
    }

    if (pullVitals && latestVitals) {
      blocks.push([
        "[Latest vitals]",
        latestVitals.bp ? `BP: ${latestVitals.bp}` : "",
        latestVitals.pulse ? `Pulse: ${latestVitals.pulse}` : "",
        latestVitals.temperature ? `Temperature: ${latestVitals.temperature}` : "",
        latestVitals.spo2 ? `SpO₂: ${latestVitals.spo2}` : "",
        latestVitals.weight ? `Weight: ${latestVitals.weight}` : "",
        latestVitals.height ? `Height: ${latestVitals.height}` : "",
        latestVitals.createdAt ? `Recorded: ${formatIst(latestVitals.createdAt)}` : "",
      ].filter(Boolean).join("\n"));
    }

    if (pullIo && ioRows.length) {
      blocks.push([
        "[Recent intake / output]",
        ...ioRows.slice(0, 12).map((r) =>
          `${r.kind === "intake" ? "Intake" : "Output"} · ${r.category}${r.volumeMl ? ` · ${r.volumeMl} mL` : ""}${r.notes ? ` · ${r.notes}` : ""} · ${formatIst(r.at)}`
        ),
      ].join("\n"));
    }

    if (selectedLabRows.length) {
      blocks.push([
        "[Selected laboratory results / orders]",
        ...selectedLabRows.map((l) =>
          `${l.testName}: ${l.result || l.status || "—"}${l.orderedAt ? ` · ${formatIst(l.orderedAt)}` : ""}`
        ),
      ].join("\n"));
    }

    if (selectedDiagnosticRows.length) {
      blocks.push([
        "[Selected radiology / diagnostics]",
        ...selectedDiagnosticRows.map((d) =>
          `${d.studyName}${d.modality ? ` (${d.modality})` : ""}: ${d.impression || d.result || d.status || "—"}${(d.orderedAt || d.createdAt) ? ` · ${formatIst(d.orderedAt || d.createdAt)}` : ""}`
        ),
      ].join("\n"));
    }

    if (selectedPrescriptionRows.length) {
      blocks.push([
        "[Selected medications]",
        ...selectedPrescriptionRows.map((r) => r.medicines ? String(r.medicines) : "").filter(Boolean),
      ].join("\n"));
    }

    if (pullRecentNotes) {
      const recent = encounters
        .slice(0, 5)
        .map((e) => `[${formatIst(e.createdAt)}] ${e.clinicalNotes || e.assessment || e.diagnosis || e.chiefComplaint || "Clinical entry"}`)
        .filter(Boolean);
      if (recent.length) blocks.push(["[Recent clinical notes]", ...recent].join("\n"));
    }

    if (!blocks.length) {
      setErr("Select at least one chart item to pull into the note.");
      return;
    }

    setErr("");
    setClinicalNotes((current) => current.trim() ? `${current.trim()}\n\n${blocks.join("\n\n")}` : blocks.join("\n\n"));
    setMsg("Selected chart data added to the clinical note. Review and edit before saving.");
  };

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
      ].filter(Boolean).join("\n");
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
      setSelectedLabs([]);
      setSelectedDiagnostics([]);
      setSelectedPrescriptions([]);
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
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Add clinical note</h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Pull existing chart data into the note while you type. Pulled values remain editable text until you save.
          </p>
        </div>
        <form onSubmit={save} className="space-y-2.5 p-3">
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
          {msg && <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{msg}</div>}
          <label className="block text-[11px] font-medium text-gray-600">
            Note type
            <select value={noteType} onChange={(e) => setNoteType(e.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm">
              {NOTE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-gray-600">
            Chief complaint (optional)
            <input value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm" placeholder="Presenting complaint" />
          </label>
          <label className="block text-[11px] font-medium text-gray-600">
            Clinical notes
            <textarea value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} className="mt-1 min-h-[10rem] w-full rounded-lg border px-2 py-2 text-sm" placeholder="Status, events, findings, response… You can pull labs, radiology, vitals, I/O and other chart data from the panel on the right." />
          </label>
          <label className="block text-[11px] font-medium text-gray-600">
            Assessment
            <textarea value={assessment} onChange={(e) => setAssessment(e.target.value)} className="mt-1 min-h-[3rem] w-full rounded-lg border px-2 py-2 text-sm" />
          </label>
          <label className="block text-[11px] font-medium text-gray-600">
            Diagnosis
            <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm" />
          </label>
          <label className="block text-[11px] font-medium text-gray-600">
            Plan
            <textarea value={plan} onChange={(e) => setPlan(e.target.value)} className="mt-1 min-h-[3rem] w-full rounded-lg border px-2 py-2 text-sm" />
          </label>
          <button type="submit" disabled={saving} className="h-10 w-full rounded-lg bg-[#c2183a] text-sm font-medium text-white disabled:opacity-60">
            {saving ? "Saving…" : "Save clinical note"}
          </button>
          <p className="text-[11px] text-gray-400">Saved as a clinical encounter. Author is the signed-in staff member (server session).</p>
        </form>
      </section>

      <aside className="space-y-3 xl:sticky xl:top-3 self-start">
        <section className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b bg-[#f8f6fa] px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Pull from patient chart</h3>
            <p className="mt-0.5 text-[11px] text-gray-500">Choose exactly what should be inserted into this note.</p>
          </div>
          <div className="space-y-2 p-3">
            {[
              ["problems", pullProblems, setPullProblems, "Problems / diagnosis"],
              ["vitals", pullVitals, setPullVitals, "Latest vitals"],
              ["io", pullIo, setPullIo, "Intake / output"],
              ["recent", pullRecentNotes, setPullRecentNotes, "Recent clinical notes"],
            ].map(([key, checked, setter, label]) => (
              <label key={String(key)} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={Boolean(checked)} onChange={(e) => (setter as React.Dispatch<React.SetStateAction<boolean>>)(e.target.checked)} />
                <span>{String(label)}</span>
              </label>
            ))}

            <div className="border-t pt-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Laboratory — select results/orders</p>
              <div className="max-h-40 space-y-1 overflow-auto">
                {labs.length === 0 ? <p className="text-[11px] text-gray-400">No laboratory records.</p> : labs.slice(0, 20).map((l) => (
                  <label key={l.id} className="flex items-start gap-2 text-[11px]">
                    <input type="checkbox" checked={selectedLabs.includes(l.id)} onChange={() => toggle(setSelectedLabs, l.id)} />
                    <span><b>{l.testName}</b><span className="text-gray-500"> · {l.result || l.status || "—"}</span></span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t pt-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Radiology / diagnostics — select studies</p>
              <div className="max-h-40 space-y-1 overflow-auto">
                {diagnostics.length === 0 ? <p className="text-[11px] text-gray-400">No radiology/diagnostic records.</p> : diagnostics.slice(0, 20).map((d) => (
                  <label key={d.id} className="flex items-start gap-2 text-[11px]">
                    <input type="checkbox" checked={selectedDiagnostics.includes(d.id)} onChange={() => toggle(setSelectedDiagnostics, d.id)} />
                    <span><b>{d.studyName}</b><span className="text-gray-500"> · {d.impression || d.result || d.status || "—"}</span></span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t pt-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Medications — select prescriptions</p>
              <div className="max-h-32 space-y-1 overflow-auto">
                {prescriptions.length === 0 ? <p className="text-[11px] text-gray-400">No prescriptions.</p> : prescriptions.slice(0, 12).map((r) => (
                  <label key={r.id} className="flex items-start gap-2 text-[11px]">
                    <input type="checkbox" checked={selectedPrescriptions.includes(r.id)} onChange={() => toggle(setSelectedPrescriptions, r.id)} />
                    <span>{String(r.medicines || "Prescription").slice(0, 140)}</span>
                  </label>
                ))}
              </div>
            </div>

            <button type="button" onClick={pullSelected} className="h-10 w-full rounded-lg bg-[#140a1f] text-xs font-semibold text-white">
              Insert selected chart data into note
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b bg-[#f8f6fa] px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Documentation history (IST)</h3>
          </div>
          <div className="max-h-[24rem] space-y-2 overflow-auto p-3">
            {sorted.length === 0 ? <p className="py-2 text-xs text-gray-400">No clinical notes yet.</p> : sorted.map((e: any) => (
              <article key={e.id} className="rounded-lg border p-3 text-xs">
                <div className="mb-1 flex flex-wrap justify-between gap-2">
                  <span className="text-sm font-semibold">{e.date || formatIst(e.createdAt, { dateOnly: true })}</span>
                  <span className="text-gray-500">{formatIst(e.createdAt)}</span>
                </div>
                {e.chiefComplaint && <p><b>Chief complaint:</b> {e.chiefComplaint}</p>}
                {e.clinicalNotes && <p className="mt-1 whitespace-pre-wrap"><b>Notes:</b> {e.clinicalNotes}</p>}
                {e.assessment && <p className="mt-1 whitespace-pre-wrap"><b>Assessment:</b> {e.assessment}</p>}
                {e.diagnosis && <p className="mt-1"><b>Diagnosis:</b> {e.diagnosis}</p>}
                {e.plan && <p className="mt-1 whitespace-pre-wrap"><b>Plan:</b> {e.plan}</p>}
              </article>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
