"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

type WorkflowModule = "Physiotherapy" | "Dietitian";
type Patient = { id: string; name: string; age?: number; gender?: string; uhid?: string; registrationNo?: string; allergies?: string; status?: string };
type RecordRow = { id: string; title: string; recordType: string; status: string; data: Record<string, any>; createdAt: string; updatedAt: string; createdBy?: string };

const PHYSIO_FIELDS = [
  ["referralReason", "Referral / reason", "text"],
  ["assessment", "Physiotherapy assessment", "area"],
  ["functionalStatus", "Functional / mobility status", "area"],
  ["goals", "Rehabilitation goals", "area"],
  ["precautions", "Precautions / contraindications", "area"],
  ["plan", "Plan and frequency", "area"],
  ["exercises", "Exercises / interventions", "area"],
  ["sessionNotes", "Session notes", "area"],
  ["progress", "Progress / response", "area"],
  ["reviewDate", "Review / follow-up date", "date"],
  ["therapist", "Responsible therapist", "text"],
] as const;
const DIET_FIELDS = [
  ["diagnosis", "Diagnosis / comorbidities", "area"],
  ["nutritionScreening", "Nutrition screening / nutritional status", "area"],
  ["weightKg", "Current weight (kg)", "text"],
  ["heightCm", "Height (cm)", "text"],
  ["dietPreference", "Explicit diet preference", "text"],
  ["culturalPreferences", "Cultural / religious preferences", "text"],
  ["ckdStage", "CKD stage (if applicable)", "text"],
  ["dialysisStatus", "Dialysis status (if applicable)", "text"],
  ["labs", "Relevant recent labs and dates", "area"],
  ["medications", "Relevant medications", "area"],
  ["fluidRestriction", "Fluid restriction (only if prescribed)", "text"],
  ["oralEnteralIntake", "Oral / enteral intake", "area"],
  ["goals", "Nutrition goals / cautions", "area"],
  ["mealChart", "Meal chart (time, foods, portions, substitutions, nutrient estimates, rationale and sources)", "area"],
  ["monitoring", "Monitoring and review plan", "area"],
  ["patientInstructions", "Patient-friendly instructions", "area"],
  ["guidanceSources", "Guidance sources / version / date (verify before approval)", "area"],
] as const;

const initialValues: Record<string, string> = {
  referralReason: "", assessment: "", functionalStatus: "", goals: "", precautions: "", plan: "", exercises: "", sessionNotes: "", progress: "", reviewDate: "", therapist: "",
  diagnosis: "", nutritionScreening: "", weightKg: "", heightCm: "", dietPreference: "", culturalPreferences: "", ckdStage: "", dialysisStatus: "", labs: "", medications: "", fluidRestriction: "", oralEnteralIntake: "", mealChart: "", monitoring: "", patientInstructions: "", guidanceSources: "",
};

export default function ClinicalWorkflowModule({ module }: { module: WorkflowModule }) {
  const { doctor, loading: authLoading } = useDoctor();
  const [requestedPatientId, setRequestedPatientId] = useState("");
  useEffect(() => { setRequestedPatientId(new URLSearchParams(window.location.search).get("patientId") || ""); }, []);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingRecordId, setEditingRecordId] = useState("");
  const [aiDraftGenerated, setAiDraftGenerated] = useState(false);
  const [aiDraftSource, setAiDraftSource] = useState("");
  const isDietitian = module === "Dietitian";
  const fields = isDietitian ? DIET_FIELDS : PHYSIO_FIELDS;
  const selectedPatient = useMemo(() => patients.find((p) => p.id === patientId), [patients, patientId]);

  const loadPatients = useCallback(async () => {
    const response = await fetch("/api/patients?view=search", { credentials: "include", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load patients.");
    const list = Array.isArray(data.patients) ? data.patients : [];
    setPatients(list);
    if (requestedPatientId) setPatientId(requestedPatientId);
    else if (!patientId && list.length) setPatientId(list[0].id);
  }, [patientId, requestedPatientId]);

  const loadRecords = useCallback(async () => {
    if (!patientId) { setRecords([]); return; }
    const response = await fetch(`/api/clinical-workflows?module=${encodeURIComponent(module)}&patientId=${encodeURIComponent(patientId)}`, { credentials: "include", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || "Could not load workflow records.");
    setRecords(Array.isArray(data.records) ? data.records : []);
  }, [module, patientId]);

  useEffect(() => {
    if (authLoading || !doctor) return;
    setLoading(true); setError("");
    loadPatients().catch((e) => setError(e.message || "Could not load patients.")).finally(() => setLoading(false));
  }, [authLoading, doctor, loadPatients]);

  useEffect(() => {
    if (authLoading || !doctor || !patientId) { setRecords([]); return; }
    loadRecords().catch((e) => setError(e.message || "Could not load workflow records."));
  }, [authLoading, doctor, patientId, loadRecords]);

  const update = (key: string, value: string) => setValues((previous) => ({ ...previous, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(""); setMessage("");
    if (!patientId) { setError("Select a patient before saving."); return; }
    if (isDietitian && !values.dietPreference.trim()) { setError("Record the patient's explicit dietary preference; do not infer it."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/clinical-workflows", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module, recordType: isDietitian ? "DIET_ASSESSMENT" : "PHYSIOTHERAPY_SESSION",
          title: isDietitian ? `Dietitian assessment — ${selectedPatient?.name || "patient"}` : `Physiotherapy session — ${selectedPatient?.name || "patient"}`,
          data: {
            ...values, patientId,
            recordKind: isDietitian ? (aiDraftGenerated ? "AI_DIET_CHART_DRAFT" : "DIET_CHART") : "PHYSIOTHERAPY_RECORD",
            dietPreference: values.dietPreference,
            version: editingRecordId ? Number(records.find((record) => record.id === editingRecordId)?.data?.version || 1) + 1 : 1,
            ...(editingRecordId ? { supersedesRecordId: editingRecordId } : {}),
            ...(aiDraftGenerated ? { aiSource: aiDraftSource, aiDraftStatus: "DRAFT" } : {}),
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Could not save record.");
      setMessage(editingRecordId ? "New draft version saved. The previous version is retained in history." : "Saved as DRAFT. Review and approve through the authorized workflow.");
      setEditingRecordId(""); setAiDraftGenerated(false); setAiDraftSource("");
      setValues(initialValues);
      await loadRecords();
    } catch (e: any) { setError(e.message || "Could not save record."); }
    finally { setSaving(false); }
  };

  const generateDietDraft = async () => {
    setError(""); setMessage("");
    if (!patientId) { setError("Select a patient first."); return; }
    setAiBusy(true);
    try {
      const response = await fetch("/api/clinical-workflows/diet-draft", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, diagnosis: values.diagnosis, comorbidities: values.diagnosis, weightKg: values.weightKg, heightCm: values.heightCm, dietPreference: values.dietPreference, culturalPreferences: values.culturalPreferences, ckdStage: values.ckdStage, dialysisStatus: values.dialysisStatus, labs: values.labs, fluidRestriction: values.fluidRestriction, oralEnteralIntake: values.oralEnteralIntake, goals: values.goals, medications: values.medications, nutritionScreening: values.nutritionScreening, allergies: selectedPatient?.allergies }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error([data.error, ...(data.missingInputs || [])].filter(Boolean).join(" — ") || "Could not generate a nutrition draft.");
      setValues((previous) => ({ ...previous, mealChart: data.draft.mealChart || "", monitoring: data.draft.monitoring || "", patientInstructions: data.draft.patientInstructions || "", guidanceSources: data.draft.guidanceSources || "", nutritionScreening: previous.nutritionScreening || data.draft.assessment || "" }));
      setAiDraftGenerated(true); setAiDraftSource(String(data.draft.source || "unknown"));
      setMessage("AI draft generated. It is not an order; verify all nutrient estimates and sources before saving or approval.");
    } catch (e: any) { setError(e.message || "Nutrition AI failed; use the manual chart."); }
    finally { setAiBusy(false); }
  };

  const approve = async (record: RecordRow) => {
    if (!window.confirm("Approve this clinical workflow record? Confirm that you have reviewed its contents and sources.")) return;
    setError(""); setMessage("");
    try {
      const response = await fetch("/api/clinical-workflows", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: record.id, status: "APPROVED" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Could not approve record.");
      setMessage("Record approved and audit recorded."); await loadRecords();
    } catch (e: any) { setError(e.message || "Could not approve record."); }
  };

  if (authLoading || !doctor || loading) return <AppShell><div className="p-5 text-sm text-gray-500">Loading {module.toLowerCase()} workflow…</div></AppShell>;

  return <AppShell>
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <header className="medlum-dashboard-hero">
        <div><p className="medlum-eyebrow">CLINICAL WORKFLOW</p><h1>{isDietitian ? "Dietitian & Nutrition" : "Physiotherapy"}</h1><p>{isDietitian ? "Assessment, editable diet charts, monitoring and professional approval." : "Referral, functional assessment, goals, interventions and progress notes."}</p></div>
        <div className="flex items-center gap-2"><span className="text-xs rounded-full border px-3 py-1 bg-white">Draft → Review → Approval</span><button type="button" onClick={() => window.print()} className="h-9 rounded-lg border bg-white px-3 text-xs font-semibold">Print / Save PDF</button></div>
      </header>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">{message}</div>}
      <section className="rounded-xl border bg-white p-3 space-y-2">
        <label className="block text-xs font-semibold text-gray-600">Patient</label>
        <select value={patientId} onChange={(e) => { setPatientId(e.target.value); setValues(initialValues); }} className="w-full max-w-xl h-10 rounded-lg border px-2 text-sm">
          <option value="">Select a patient</option>
          {patients.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.uhid || p.registrationNo || p.id.slice(0, 8)} · {p.age ?? "—"}y</option>)}
        </select>
        {selectedPatient && <p className="text-xs text-gray-500">Chart: {selectedPatient.name} · allergy status: {selectedPatient.allergies || "Unknown / not assessed"} · record remains scoped to this patient and facility.</p>}
      </section>
      {patientId && <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] gap-4 items-start">
        <form onSubmit={save} className="rounded-xl border bg-white p-3 space-y-3">
          <div><h2 className="font-semibold text-sm">{isDietitian ? "Nutrition assessment / diet-chart draft" : "Physiotherapy assessment / session"}</h2><p className="text-[11px] text-gray-500 mt-1">All changes are saved as drafts and audit logged. Do not enter unverified data.</p></div>
          {fields.map(([key, label, kind]) => <label key={key} className="block text-xs font-medium text-gray-600">{label}
            {key === "dietPreference" ? <select value={values[key] || ""} onChange={(e) => update(key, e.target.value)} className="mt-1 w-full h-9 rounded-lg border px-2 text-sm font-normal"><option value="">Select explicit patient preference</option>{["Vegetarian", "Vegan", "Ovo-vegetarian", "Non-vegetarian", "Kosher", "Halal", "Jain", "Other / patient-defined"].map((option) => <option key={option} value={option}>{option}</option>)}</select>
            : kind === "area" ? <textarea value={values[key] || ""} onChange={(e) => update(key, e.target.value)} rows={key === "mealChart" || key === "assessment" ? 5 : 3} className="mt-1 w-full rounded-lg border px-2 py-2 text-sm font-normal" placeholder={key === "mealChart" ? "Meal/time | Indian or patient-selected foods (e.g. idli, poha, dal, roti, rice) | portion | supported nutrient estimates | substitutions | rationale | cautions | sources/version/date" : ""} />
            : <input type={kind === "date" ? "date" : "text"} value={values[key] || ""} onChange={(e) => update(key, e.target.value)} className="mt-1 w-full h-9 rounded-lg border px-2 text-sm font-normal" /> }
          </label>)}
          {isDietitian && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">AI output is a DRAFT only. CKD restrictions must be individualized; complex CKD, protein-losing enteropathy, hypothyroidism and conflicting comorbidities require dietitian/clinician review. Do not approve unverified sources or estimated nutrient values.</div>}
          <div className="flex flex-wrap gap-2">
            {isDietitian && <button type="button" onClick={generateDietDraft} disabled={aiBusy || !patientId} className="h-9 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50">{aiBusy ? "Generating draft…" : "Generate AI diet-chart draft"}</button>}
            <button type="submit" disabled={saving || !patientId} className="h-9 rounded-lg bg-[#c2183a] px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save as draft"}</button>
          </div>
        </form>
        <section className="rounded-xl border bg-white p-3 space-y-3">
          <div><h2 className="font-semibold text-sm">Patient workflow history</h2><p className="text-[11px] text-gray-500 mt-1">Only this patient's records in the selected clinic are shown.</p></div>
          {records.length === 0 ? <p className="text-xs text-gray-400">No {module.toLowerCase()} records for this patient yet.</p> : records.map((record) => <article key={record.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{record.title} · v{Number(record.data?.version || 1)}</h3><p className="text-[10px] text-gray-500">{new Date(record.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p></div><span className="rounded-full border px-2 py-1 text-[10px]">{record.status}</span></div>
            {fields.filter(([key]) => String(record.data?.[key] || "").trim()).map(([key, label]) => <p key={key} className="text-xs whitespace-pre-wrap"><b>{label}:</b> {record.data[key]}</p>)}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setEditingRecordId(record.id); setValues({ ...initialValues, ...Object.fromEntries(fields.map(([key]) => [key, String(record.data?.[key] ?? "")])) }); setAiDraftGenerated(record.data?.recordKind === "AI_DIET_CHART_DRAFT"); setAiDraftSource(String(record.data?.aiSource || "")); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="h-8 rounded-lg border px-3 text-xs font-semibold">Edit / new version</button>
              {record.status !== "APPROVED" && <button type="button" onClick={() => approve(record)} className="h-8 rounded-lg border px-3 text-xs font-semibold">Review and approve</button>}
            </div>
          </article>)}
        </section>
      </div>}
    </div>
    <style jsx global>{`@media print { .medlum-topbar, .medlum-primary-nav, .medlum-mobile-nav, button, select, input, textarea, form { display: none !important; } body * { color: #000 !important; box-shadow: none !important; } article { break-inside: avoid; } }`}</style>
  </AppShell>;
}
