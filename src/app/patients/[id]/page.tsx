"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { EXPANDED_LAB_CATALOG, EXPANDED_RADIOLOGY_CATALOG } from "@/lib/diagnostic-catalog";
import AbhaPatientPanel from "@/components/AbhaPatientPanel";
import { apiGetPatientDetail, apiCreateEncounter, apiAddPrescriptionWithEncounter, apiAddInvoice, apiAddAppointment, apiCreateLabOrder, apiCreateDiagnosticOrder, apiGetClinicalNotes, apiCreateClinicalNote, apiSaveClinicalDraft, apiSubmitClinicalNote, apiFinalizeClinicalNote, apiCancelRecord } from "@/lib/api";

const CONSULT_DRAFT_KEY_PREFIX = "medlum:consult-draft:";

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get("appointmentId") || undefined;
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [data, setData] = useState<any>(null);
  const [clinicalNotes, setClinicalNotes] = useState<any[]>([]);
  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteType, setNoteType] = useState("Progress Note");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showConsult, setShowConsult] = useState(!!appointmentId);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [followSaving, setFollowSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [followError, setFollowError] = useState("");
  const [follow, setFollow] = useState({ date: "", time: "10:00", type: "Follow-up" });
  const [form, setForm] = useState({
    chiefComplaint: "", clinicalNotes: "", diagnosis: "", assessment: "", plan: "", followUpDate: "",
    bp: "", pulse: "", rr: "", temperature: "", spo2: "", weight: "", height: "", medicines: "", advice: "", billAmount: "",
  });
  const [selectedLabs, setSelectedLabs] = useState<string[]>([]);
  const [selectedDiagnostics, setSelectedDiagnostics] = useState<string[]>([]);
  const [labSearch, setLabSearch] = useState("");
  const [diagnosticSearch, setDiagnosticSearch] = useState("");
  const [favoriteLabs, setFavoriteLabs] = useState<string[]>([]);
  const [favoriteDiagnostics, setFavoriteDiagnostics] = useState<string[]>([]);
  const [hasConsultDraft, setHasConsultDraft] = useState(false);
  const [consultDraftSavedAt, setConsultDraftSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [detail, notes] = await Promise.all([apiGetPatientDetail(id), apiGetClinicalNotes(id)]);
    setData(detail);
    setClinicalNotes(notes);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) { router.replace("/login"); return; }
    void load();
  }, [authLoading, doctor, load, router]);

  const clinicianKey = doctor?.id ? String(doctor.id) : "current";
  const labFavoriteKey = `medlum:fav-labs:${clinicianKey}`;
  const diagnosticFavoriteKey = `medlum:fav-diagnostics:${clinicianKey}`;
  const visibleLabs = useMemo(() => { const q=labSearch.trim().toLowerCase(); const list=EXPANDED_LAB_CATALOG.filter(x=>!q||x.name.toLowerCase().includes(q)||x.category.toLowerCase().includes(q)); return [...list].sort((a,b)=>Number(favoriteLabs.includes(b.name))-Number(favoriteLabs.includes(a.name))||a.name.localeCompare(b.name)); },[labSearch,favoriteLabs]);
  const visibleDiagnostics = useMemo(() => { const q=diagnosticSearch.trim().toLowerCase(); const list=EXPANDED_RADIOLOGY_CATALOG.filter(x=>!q||x.name.toLowerCase().includes(q)||x.category.toLowerCase().includes(q)||x.modality.toLowerCase().includes(q)); return [...list].sort((a,b)=>Number(favoriteDiagnostics.includes(b.name))-Number(favoriteDiagnostics.includes(a.name))||a.name.localeCompare(b.name)); },[diagnosticSearch,favoriteDiagnostics]);

  const consultDraftKey = id ? CONSULT_DRAFT_KEY_PREFIX + id : "";

  useEffect(() => { if (typeof window === "undefined") return; try { setFavoriteLabs(JSON.parse(window.localStorage.getItem(labFavoriteKey)||"[]")); setFavoriteDiagnostics(JSON.parse(window.localStorage.getItem(diagnosticFavoriteKey)||"[]")); } catch { setFavoriteLabs([]); setFavoriteDiagnostics([]); } }, [labFavoriteKey, diagnosticFavoriteKey]);

  useEffect(() => {
    if (!consultDraftKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(consultDraftKey);
      if (!raw) { setHasConsultDraft(false); setConsultDraftSavedAt(null); return; }
      const draft = JSON.parse(raw);
      if (draft?.form) { setHasConsultDraft(true); setConsultDraftSavedAt(draft.savedAt || null); }
    } catch { window.localStorage.removeItem(consultDraftKey); setHasConsultDraft(false); setConsultDraftSavedAt(null); }
  }, [consultDraftKey]);

  const p = data?.patient;
  const lastEncounter = data?.encounters?.[0];
  const latestVitals = data?.patient?.latestVitals || null;
  const lastVitals = latestVitals
    ? [latestVitals.bp && `BP ${latestVitals.bp}`, latestVitals.pulse && `P ${latestVitals.pulse}`, latestVitals.spo2 && `SpO₂ ${latestVitals.spo2}`, latestVitals.rr && `RR ${latestVitals.rr}`, latestVitals.temperature && `T ${latestVitals.temperature}`, latestVitals.weight && `Wt ${latestVitals.weight}`].filter(Boolean).join(" · ")
    : lastEncounter
      ? [lastEncounter.bp && `BP ${lastEncounter.bp}`, lastEncounter.pulse && `P ${lastEncounter.pulse}`, lastEncounter.spo2 && `SpO₂ ${lastEncounter.spo2}`, lastEncounter.rr && `RR ${lastEncounter.rr}`, lastEncounter.temperature && `T ${lastEncounter.temperature}`, lastEncounter.weight && `Wt ${lastEncounter.weight}`].filter(Boolean).join(" · ")
      : "";



  const saveConsultDraft = () => {
    if (!consultDraftKey || typeof window === "undefined") return;
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(consultDraftKey, JSON.stringify({ form, selectedLabs, selectedDiagnostics, savedAt }));
    setHasConsultDraft(true); setConsultDraftSavedAt(savedAt);
    setMsg("Consultation saved as draft on this device. It has not been added to the clinical record.");
  };

  const restoreConsultDraft = () => {
    if (!consultDraftKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(consultDraftKey); if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft?.form) setForm(draft.form);
      if (Array.isArray(draft.selectedLabs)) setSelectedLabs(draft.selectedLabs);
      if (Array.isArray(draft.selectedDiagnostics)) setSelectedDiagnostics(draft.selectedDiagnostics);
      setShowConsult(true); setMsg("Draft restored. Review it before confirming and saving.");
    } catch { setMsg("Could not restore the consultation draft."); }
  };

  const cancelConsultDraft = () => {
    if (!window.confirm("Cancel this consultation draft?\n\nThe unsaved consultation will be discarded from this device and will not be added to the clinical record.")) return;
    if (consultDraftKey) window.localStorage.removeItem(consultDraftKey);
    setHasConsultDraft(false); setConsultDraftSavedAt(null);
    setForm({ chiefComplaint: "", clinicalNotes: "", diagnosis: "", assessment: "", plan: "", followUpDate: "", bp: "", pulse: "", rr: "", temperature: "", spo2: "", weight: "", height: "", medicines: "", advice: "", billAmount: "" });
    setSelectedLabs([]); setSelectedDiagnostics([]); setShowConsult(false);
    setMsg("Consultation draft cancelled and discarded.");
  };

  const handleSaveConsult = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setSaving(true);
    try {
      const enc = await apiCreateEncounter({ patientId: id, appointmentId, chiefComplaint: form.chiefComplaint, clinicalNotes: form.clinicalNotes, diagnosis: form.diagnosis, assessment: form.assessment, plan: form.plan, followUpDate: form.followUpDate || undefined, bp: form.bp, pulse: form.pulse, rr: form.rr, temperature: form.temperature, spo2: form.spo2, weight: form.weight, height: form.height });
      if (!enc.success || !enc.encounter) { setError(enc.error || "Could not save consultation"); return; }
      if (selectedLabs.length) {
        const labResults = await Promise.all(selectedLabs.map((testName) => apiCreateLabOrder({ patientId: id, testName, category: "Laboratory", encounterId: enc.encounter.id })));
        const failedLab = labResults.find((r) => !r.success);
        if (failedLab) { setError(failedLab.error || "Consultation saved, but one or more lab orders could not be created"); return; }
      }
      if (selectedDiagnostics.length) {
        const diagnosticResults = await Promise.all(selectedDiagnostics.map((studyName) => {
          const study = EXPANDED_RADIOLOGY_CATALOG.find((x) => x.name === studyName);
          return apiCreateDiagnosticOrder({ patientId: id, studyName, modality: study?.modality || "Other", indication: form.diagnosis || form.chiefComplaint || undefined, encounterId: enc.encounter.id });
        }));
        const failedDiagnostic = diagnosticResults.find((r) => !r.success);
        if (failedDiagnostic) { setError(failedDiagnostic.error || "Consultation saved, but one or more diagnostic orders could not be created"); return; }
      }
      if (form.medicines.trim()) await apiAddPrescriptionWithEncounter({ patientId: id, patientName: data?.patient?.name || "", medicines: form.medicines.trim(), advice: form.advice.trim(), encounterId: enc.encounter.id });
      const amt = parseFloat(form.billAmount);
      if (amt > 0) await apiAddInvoice({ patientId: id, items: [{ description: "Consultation fee", category: "Service", quantity: 1, unitPrice: amt }], note: form.diagnosis ? `Consultation: ${form.diagnosis}` : "Consultation fee" });
      if (consultDraftKey) window.localStorage.removeItem(consultDraftKey);
      setHasConsultDraft(false); setConsultDraftSavedAt(null);
      setMsg("Consultation confirmed and saved.");
      setShowConsult(false);
      setForm({ chiefComplaint: "", clinicalNotes: "", diagnosis: "", assessment: "", plan: "", followUpDate: "", bp: "", pulse: "", rr: "", temperature: "", spo2: "", weight: "", height: "", medicines: "", advice: "", billAmount: "" });
      setSelectedLabs([]);
      setSelectedDiagnostics([]);
      await load();
    } catch {
      setError("Could not save consultation");
    } finally {
      setSaving(false);
    }
  };

  const resetNoteComposer = () => {
    setEditingNoteId(null); setNoteType("Progress Note"); setNoteTitle(""); setNoteContent(""); setNoteError(""); setShowNoteComposer(false);
  };

  const saveClinicalNote = async (submit: boolean) => {
    setNoteError(""); setNoteSaving(true);
    try {
      const res = editingNoteId
        ? await apiSaveClinicalDraft({ id: editingNoteId, content: noteContent, title: noteTitle, noteType })
        : await apiCreateClinicalNote({ patientId: id, noteType, title: noteTitle, content: noteContent, submit });
      if (!res.success) { setNoteError(res.error || "Could not save clinical note"); return; }
      setMsg(submit ? "Clinical note submitted for second-clinician verification." : "Clinical note saved as draft.");
      resetNoteComposer();
      setClinicalNotes(await apiGetClinicalNotes(id));
    } catch { setNoteError("Could not save clinical note"); }
    finally { setNoteSaving(false); }
  };

  const submitClinicalNote = async (noteId: string) => {
    const res = await apiSubmitClinicalNote(noteId);
    if (!res.success) { setMsg(res.error || "Could not submit note"); return; }
    setMsg("Note is awaiting verification by a different clinician.");
    setClinicalNotes(await apiGetClinicalNotes(id));
  };

  const cancelRecord = async (entity: string, recordId: string) => {
    const reason = window.prompt("Enter the reason for cancellation:");
    if (!reason?.trim()) return;
    const res = await apiCancelRecord(entity, recordId, reason.trim());
    if (!res.success) { setMsg(res.error || "Could not cancel record"); return; }
    setMsg(res.deleted ? "Draft cancelled and deleted." : "Record cancelled. The cancellation is retained in the audit trail.");
    await load();
    setClinicalNotes(await apiGetClinicalNotes(id));
  };

  const finalSignClinicalNote = async (noteId: string) => {
    const res = await apiFinalizeClinicalNote(noteId);
    if (!res.success) { setMsg(res.error || "Could not final-sign note"); return; }
    setMsg("Clinical note final-signed and locked.");
    setClinicalNotes(await apiGetClinicalNotes(id));
  };

  const scheduleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault(); setFollowError(""); setFollowSaving(true);
    try {
      const res = await apiAddAppointment({ patientId: id, patientName: p?.name || "", date: follow.date, time: follow.time, type: follow.type });
      if (!res.success) { setFollowError(res.error || "Could not schedule"); return; }
      setShowFollowUp(false);
      setMsg("Follow-up scheduled.");
      await load();
    } catch {
      setFollowError("Could not schedule");
    } finally {
      setFollowSaving(false);
    }
  };

  if (authLoading || loading) return <AppShell><div className="p-6 text-sm text-gray-500">Loading patient…</div></AppShell>;
  if (!p) return <AppShell><div className="p-6 text-sm text-red-600">Patient not found.</div></AppShell>;

  return (
    <AppShell>
      <>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3 print:hidden">
          <div>
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="text-xs text-gray-500">{p.age} yrs · {p.gender} · {p.phone}</p>
        <div className="mt-1 grid gap-x-4 gap-y-0.5 text-[11px] text-gray-500 sm:grid-cols-2">
              <span><b className="text-gray-600">UHID:</b> {p.uhid || "—"}</span>
              <span><b className="text-gray-600">MedLum ID:</b> {p.medlumId || "—"}</span>
              {p.careSetting === "IPD" && (
                <span><b className="text-gray-600">Admission:</b> {p.admissionDate ? new Date(p.admissionDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
              )}
              {p.registrationNo && <span><b className="text-gray-600">Registration:</b> {p.registrationNo}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/patients/${id}/chart`} className="h-9 px-3 rounded-lg bg-[#140a1f] text-white text-xs font-medium inline-flex items-center">Clinical chart</Link>
            <button type="button" onClick={() => setShowConsult(true)} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-xs font-medium">New consult</button>
            {hasConsultDraft && <button type="button" onClick={restoreConsultDraft} className="h-9 px-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-medium">Restore draft</button>}
            <button type="button" onClick={() => setShowFollowUp(true)} className="h-9 px-3 rounded-lg border text-xs font-medium">Follow-up</button>
            <Link href="/patients" className="h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center">Back</Link>
          </div>
        </div>

        <section className="mb-3 bg-white rounded-xl border shadow-sm p-3 print:border-0 print:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-sm">Cover Sheet · Current Clinical Snapshot</h3>
              <p className="text-[10px] text-gray-500">Latest recorded vitals and allergy status for this patient.</p>
            </div>
            {latestVitals?.recordedAt && <span className="text-[10px] text-gray-500">Recorded {new Date(latestVitals.recordedAt).toLocaleString("en-IN")}</span>}
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="rounded-lg border px-2.5 py-2"><p className="text-[10px] text-gray-500">BP</p><p className="text-sm font-semibold">{latestVitals?.bp || p.bp || "—"}</p></div>
            <div className="rounded-lg border px-2.5 py-2"><p className="text-[10px] text-gray-500">Pulse</p><p className="text-sm font-semibold">{latestVitals?.pulse || "—"}</p></div>
            <div className="rounded-lg border px-2.5 py-2"><p className="text-[10px] text-gray-500">SpO₂</p><p className="text-sm font-semibold">{latestVitals?.spo2 || "—"}</p></div>
            <div className="rounded-lg border px-2.5 py-2"><p className="text-[10px] text-gray-500">Respiratory Rate</p><p className="text-sm font-semibold">{latestVitals?.rr || "—"}</p></div>
            <div className="rounded-lg border px-2.5 py-2"><p className="text-[10px] text-gray-500">Allergy</p><p className={`text-sm font-semibold ${p.allergies ? "text-red-700" : ""}`}>{p.allergies || "No known allergy recorded"}</p></div>
          </div>
        </section>

        <div className="print:block hidden mb-3"><b>Patient:</b> {p.name} · {p.age} yrs · {p.gender} · {p.phone}</div>
        {lastEncounter ? (
          <div className="border-t pt-2 mb-3 print:hidden">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Latest clinical context · {lastEncounter.date}</p>
            {lastEncounter.chiefComplaint && <p className="text-sm mt-1"><b>Complaint:</b> {lastEncounter.chiefComplaint}</p>}
            {lastEncounter.diagnosis && <p className="text-sm"><b>Diagnosis:</b> {lastEncounter.diagnosis}</p>}
            {lastVitals && <p className="text-xs text-gray-500 mt-1">Vitals: {lastVitals}</p>}
            {lastEncounter.followUpDate && <p className="text-xs text-[#c2183a] mt-1">Follow-up: {lastEncounter.followUpDate}</p>}
          </div>
        ) : (
          <p className="text-xs text-gray-400 mb-3 print:hidden">No previous consultation recorded.</p>
        )}

        <section className="mb-3 grid gap-3 md:grid-cols-2 print:hidden">
          <Sec title={"Investigations · "+((data.labOrders||[]).length)+" laboratory · "+((data.diagnosticOrders||[]).length)+" diagnostics"}>
            <div className="grid gap-2 p-3 text-xs">
              <div><p className="font-semibold text-gray-700">Laboratory investigations ({(data.labOrders||[]).length})</p>{(data.labOrders||[]).length?<div className="mt-1 space-y-1">{(data.labOrders||[]).slice(0,20).map((o:any)=><div key={o.id} className="flex justify-between gap-2 border-b pb-1"><span>{o.testName}</span><span className="text-gray-400">{o.status||"Ordered"}</span></div>)}</div>:<p className="text-[11px] text-gray-400 mt-1">No laboratory investigations recorded.</p>}</div>
              <div><p className="font-semibold text-gray-700">Radiology / diagnostics ({(data.diagnosticOrders||[]).length})</p>{(data.diagnosticOrders||[]).length?<div className="mt-1 space-y-1">{(data.diagnosticOrders||[]).slice(0,20).map((o:any)=><div key={o.id} className="flex justify-between gap-2 border-b pb-1"><span>{o.studyName}</span><span className="text-gray-400">{o.status||"Ordered"}</span></div>)}</div>:<p className="text-[11px] text-gray-400 mt-1">No diagnostic investigations recorded.</p>}</div>
            </div>
          </Sec>
          <Sec title={"Diagnoses · "+Array.from(new Set((data.encounters||[]).map((e:any)=>String(e.diagnosis||"").trim()).filter(Boolean))).length}>
            <div className="p-3 text-xs space-y-1">{Array.from(new Set((data.encounters||[]).map((e:any)=>String(e.diagnosis||"").trim()).filter(Boolean))).slice(0,20).map((dx:any)=><div key={dx} className="border-b pb-1">{dx}</div>)}{!(data.encounters||[]).some((e:any)=>String(e.diagnosis||"").trim())&&<p className="text-[11px] text-gray-400">No diagnosis recorded in encounters.</p>}</div>
          </Sec>
        </section>

        {msg && <div className="mb-3 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm print:hidden">{msg}</div>}

        <div className="space-y-3 print:hidden">
          <AbhaPatientPanel
            patientId={id}
            patient={{
              phone: p.phone,
              abhaStatus: p.abhaStatus,
              abhaNumber: p.abhaNumber,
              abhaAddress: p.abhaAddress,
              abhaLinkedAt: p.abhaLinkedAt,
            }}
            onChanged={load}
          />

          <Sec title="Consultations">
            {!data.encounters?.length ? <Empty text="No consultations yet." /> : data.encounters.map((e: any) => (
              <div key={e.id} className="px-3 py-2.5 border-b last:border-0">
                <p className="text-xs text-gray-400">{e.date}</p>
                <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-gray-400">{e.status || "CONFIRMED"}</span>{e.status !== "CANCELLED" && <button type="button" onClick={() => cancelRecord("Encounter", e.id)} className="px-2 py-1 rounded-lg border border-red-200 text-red-700 text-[11px]">Cancel</button>}</div>
                {e.chiefComplaint && <p className="text-sm mt-0.5"><b>Complaint:</b> {e.chiefComplaint}</p>}
                {e.diagnosis && <p className="text-sm"><b>Dx:</b> {e.diagnosis}</p>}
                {e.assessment && <p className="text-xs text-gray-600"><b>Assessment:</b> {e.assessment}</p>}
                {e.plan && <p className="text-xs text-gray-600"><b>Plan:</b> {e.plan}</p>}
                {e.clinicalNotes && <p className="text-xs text-gray-600 mt-0.5">{e.clinicalNotes}</p>}
              </div>
            ))}
          </Sec>

          <Sec title="Lab Orders & Results">
            {!data.labOrders?.length ? <Empty text="No lab orders." /> : data.labOrders.map((l: any) => (
              <div key={l.id} className="px-3 py-2.5 border-b last:border-0">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{l.testName} <span className="text-xs text-gray-400 font-normal">{l.status}</span></p>{l.status !== "Cancelled" && <button type="button" onClick={() => cancelRecord("LabOrder", l.id)} className="px-2 py-1 rounded-lg border border-red-200 text-red-700 text-[11px]">Cancel</button>}</div>
                {l.result && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{l.result}</p>}
              </div>
            ))}
          </Sec>

          <Sec title="Diagnostics & Reports">
            {!data.diagnosticOrders?.length ? <Empty text="No diagnostics." /> : data.diagnosticOrders.map((d: any) => (
              <div key={d.id} className="px-3 py-2.5 border-b last:border-0">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{d.studyName} <span className="text-xs text-gray-400 font-normal">{d.modality} · {d.status}</span></p>{d.status !== "Cancelled" && <button type="button" onClick={() => cancelRecord("DiagnosticOrder", d.id)} className="px-2 py-1 rounded-lg border border-red-200 text-red-700 text-[11px]">Cancel</button>}</div>
                {d.impression && <p className="text-xs text-gray-600 mt-0.5">{d.impression}</p>}
              </div>
            ))}
          </Sec>

          <Sec title="Clinical Notes & Final Signing">
            <div className="px-3 py-3 border-b">
              <p className="text-xs text-gray-500 mb-2">Every clinical action requires confirmation. Drafts can be cancelled and deleted; submitted/final records can be cancelled with an audit trail.</p>
              <button type="button" onClick={() => { setEditingNoteId(null); setNoteType("Progress Note"); setNoteTitle(""); setNoteContent(""); setNoteError(""); setShowNoteComposer(true); }} className="h-9 px-3 rounded-lg bg-[#140a1f] text-white text-xs font-medium">
                + New clinical note / summary
              </button>
            </div>
            {!clinicalNotes.length ? <Empty text="No separately signed clinical notes yet." /> : clinicalNotes.map((n: any) => (
              <div key={n.id} className="px-3 py-3 border-b last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{n.noteType}{n.title ? ` · ${n.title}` : ""}</p>
                    <p className="text-[11px] text-gray-400">{n.status} · {n.authorRole || "Clinical staff"} · {new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                  {n.status === "DRAFT" && n.author?.id === doctor?.id && (
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => { setEditingNoteId(n.id); setNoteType(n.noteType); setNoteTitle(n.title || ""); setNoteContent(n.content); setNoteError(""); setShowNoteComposer(true); }} className="px-2.5 py-1.5 rounded-lg border text-[11px]">Edit draft</button>
                      <button type="button" onClick={() => submitClinicalNote(n.id)} className="px-2.5 py-1.5 rounded-lg bg-[#c2183a] text-white text-[11px]">Submit for verification</button>
                      <button type="button" onClick={() => cancelRecord("ClinicalNote", n.id)} className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 text-[11px]">Cancel draft</button>
                    </div>
                  )}
                  {n.status === "PENDING_VERIFICATION" && n.author?.id !== doctor?.id && (
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => finalSignClinicalNote(n.id)} className="px-2.5 py-1.5 rounded-lg bg-[#c2183a] text-white text-[11px]">Second verify + final sign</button>
                      <button type="button" onClick={() => cancelRecord("ClinicalNote", n.id)} className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 text-[11px]">Cancel</button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-700 mt-2 whitespace-pre-wrap">{n.content}</p>
                <div className="text-[10px] text-gray-500 mt-2 space-y-0.5">
                  <p>Author: {n.author?.name || "Unknown"}{n.authorRole ? " · Role: " + n.authorRole : ""}</p>
                  {n.verifier && <p>Final verifier: {n.verifier.name} · {n.finalizedAt ? new Date(n.finalizedAt).toLocaleString() : ""}</p>}
                  {n.status === "FINAL" && <><p className="font-medium">LOCKED FINAL · hash {String(n.finalHash || "").slice(0, 16)}…</p><button type="button" onClick={() => cancelRecord("ClinicalNote", n.id)} className="mt-1 px-2.5 py-1 rounded-lg border border-red-200 text-red-700 text-[11px]">Cancel final record</button></>}
                </div>
              </div>
            ))}
          </Sec>

          <Sec title="Prescriptions">
            {!data.prescriptions?.length ? <Empty text="No prescriptions." /> : data.prescriptions.map((r: any) => (
              <div key={r.id} className="px-3 py-2.5 border-b last:border-0">
                <p className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                <div className="flex items-center justify-between gap-2"><p className="text-sm whitespace-pre-wrap">{r.medicines}</p>{r.status !== "CANCELLED" && <button type="button" onClick={() => cancelRecord("Prescription", r.id)} className="px-2 py-1 rounded-lg border border-red-200 text-red-700 text-[11px]">Cancel</button>}</div>
                {r.advice && <p className="text-xs text-gray-600 mt-0.5">{r.advice}</p>}
              </div>
            ))}
          </Sec>

          <Sec title="Follow-up & Appointments">
            {!data.appointments?.length ? <Empty text="No appointments." /> : data.appointments.map((a: any) => (
              <div key={a.id} className="px-3 py-2.5 border-b last:border-0 text-sm">
                {a.date} · {a.time} · {a.type} · <span className="text-gray-500">{a.status}</span>
              </div>
            ))}
          </Sec>

          <Sec title="Billing">
            {!data.invoices?.length ? <Empty text="No invoices." /> : data.invoices.map((i: any) => (
              <div key={i.id} className="px-3 py-2.5 border-b last:border-0 text-sm">
                ₹{i.amount} · {i.status} · {new Date(i.createdAt).toLocaleDateString()}
                {i.note && <span className="text-gray-500"> · {i.note}</span>}
              </div>
            ))}
          </Sec>
        </div>

        {showConsult && p && (
          <Modal title={`Consultation — ${p.name}`} onClose={() => setShowConsult(false)}>
            <div className="mb-3 rounded-xl border border-[#e8dff0] bg-[#faf7fc] p-3">
              <p className="text-sm font-semibold text-[#140a1f]">Choose what to do with this consultation</p>
              <p className="text-xs text-gray-600 mt-1">Nothing is added to the clinical record until you choose <b>Confirm & Save</b>. You can keep an unfinished consultation as a draft or discard it completely.</p>
              <div className="mt-2 grid gap-1.5 text-[11px] text-gray-600">
                <div><b>Save as Draft:</b> keeps the unfinished consultation on this device only.</div>
                <div><b>Cancel & Discard:</b> removes the unfinished consultation and closes this form.</div>
                <div><b>Confirm & Save:</b> writes the consultation and selected orders to the clinical record.</div>
              </div>
            </div>
            {hasConsultDraft && (
              <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-amber-900">Saved consultation draft available</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">Saved {consultDraftSavedAt ? new Date(consultDraftSavedAt).toLocaleString() : "on this device"} · not yet in the clinical record.</p>
                </div>
                <button type="button" onClick={restoreConsultDraft} className="shrink-0 px-2.5 py-1.5 rounded-lg bg-amber-700 text-white text-[11px] font-medium">Restore</button>
              </div>
            )}
            {error && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <form onSubmit={handleSaveConsult} className="space-y-3">
              <div><label className="text-xs text-gray-500">Chief complaint</label><input value={form.chiefComplaint} onChange={(e) => setForm({ ...form, chiefComplaint: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
              <div><label className="text-xs text-gray-500">Diagnosis</label><input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
              <div><label className="text-xs text-gray-500">Clinical notes</label><textarea value={form.clinicalNotes} onChange={(e) => setForm({ ...form, clinicalNotes: e.target.value })} className="w-full min-h-[72px] px-3 py-2 rounded-lg border text-sm" /></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div><label className="text-xs text-gray-500">BP</label><input value={form.bp} onChange={(e) => setForm({ ...form, bp: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
                <div><label className="text-xs text-gray-500">Pulse</label><input value={form.pulse} onChange={(e) => setForm({ ...form, pulse: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
                <div><label className="text-xs text-gray-500">SpO₂</label><input value={form.spo2} onChange={(e) => setForm({ ...form, spo2: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
                <div><label className="text-xs text-gray-500">Respiratory Rate</label><input value={form.rr} onChange={(e) => setForm({ ...form, rr: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
              </div>
              <div><label className="text-xs text-gray-500">Medicines</label><textarea value={form.medicines} onChange={(e) => setForm({ ...form, medicines: e.target.value })} className="w-full min-h-[64px] px-3 py-2 rounded-lg border text-sm" placeholder="One per line" /></div>
              <div><label className="text-xs text-gray-500">Laboratory investigations <span className="text-[10px] text-gray-400">({visibleLabs.length} available)</span></label><input value={labSearch} onChange={(e)=>setLabSearch(e.target.value)} placeholder="Type any lab or category to search…" className="mt-1 w-full h-10 px-3 rounded-lg border text-sm"/><div className="mt-1 max-h-72 overflow-y-auto rounded-lg border p-1">{visibleLabs.map((t)=><div key={t.id} className="flex items-center gap-1 text-xs px-1.5 py-1"><label className="flex-1 cursor-pointer"><input type="checkbox" className="mr-1" checked={selectedLabs.includes(t.name)} onChange={(e)=>setSelectedLabs(prev=>e.target.checked?[...prev,t.name]:prev.filter(x=>x!==t.name))}/><span>{t.name}</span><span className="ml-1 text-[9px] text-gray-400">{t.category}</span></label><button type="button" aria-label={favoriteLabs.includes(t.name)?"Remove lab favorite":"Favorite lab"} onClick={()=>{const n=favoriteLabs.includes(t.name)?favoriteLabs.filter(x=>x!==t.name):[...favoriteLabs,t.name];setFavoriteLabs(n);window.localStorage.setItem(labFavoriteKey,JSON.stringify(n));}} className="px-1">{favoriteLabs.includes(t.name)?"★":"☆"}</button></div>)}</div></div><div><label className="text-xs text-gray-500">Radiology / diagnostic investigations <span className="text-[10px] text-gray-400">({visibleDiagnostics.length} available)</span></label><input value={diagnosticSearch} onChange={(e)=>setDiagnosticSearch(e.target.value)} placeholder="Type imaging, modality or body part…" className="mt-1 w-full h-10 px-3 rounded-lg border text-sm"/><div className="mt-1 max-h-72 overflow-y-auto rounded-lg border p-1">{visibleDiagnostics.map((d)=><div key={d.id} className="flex items-center gap-1 text-xs px-1.5 py-1"><label className="flex-1 cursor-pointer"><input type="checkbox" className="mr-1" checked={selectedDiagnostics.includes(d.name)} onChange={(e)=>setSelectedDiagnostics(prev=>e.target.checked?[...prev,d.name]:prev.filter(x=>x!==d.name))}/><span>{d.name}</span><span className="ml-1 text-[9px] text-gray-400">{d.category} · {d.modality}</span></label><button type="button" aria-label={favoriteDiagnostics.includes(d.name)?"Remove diagnostic favorite":"Favorite diagnostic"} onClick={()=>{const n=favoriteDiagnostics.includes(d.name)?favoriteDiagnostics.filter(x=>x!==d.name):[...favoriteDiagnostics,d.name];setFavoriteDiagnostics(n);window.localStorage.setItem(diagnosticFavoriteKey,JSON.stringify(n));}} className="px-1">{favoriteDiagnostics.includes(d.name)?"★":"☆"}</button></div>)}</div></div><div><label className="text-xs text-gray-500">Bill amount (₹)</label><input type="number" min="0" step="1" value={form.billAmount} onChange={(e) => setForm({ ...form, billAmount: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
              <div className="rounded-xl border bg-white p-2.5">
                <p className="text-[11px] font-semibold text-gray-700 mb-2">Consultation actions</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button type="button" onClick={cancelConsultDraft} disabled={saving} className="h-11 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-medium disabled:opacity-60">Cancel & Discard</button>
                  <button type="button" onClick={() => { saveConsultDraft(); setShowConsult(false); }} disabled={saving} className="h-11 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-medium disabled:opacity-60">Save as Draft</button>
                  <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[#c2183a] text-white text-xs font-semibold disabled:opacity-60">{saving ? "Saving…" : "Confirm & Save"}</button>
                </div>
                <p className="text-[10px] text-gray-500 mt-2 text-center">Confirm & Save is the only action that creates the consultation in the clinical record.</p>
              </div>
            </form>
          </Modal>
        )}

        {showNoteComposer && p && (
          <Modal title={editingNoteId ? "Edit clinical note draft" : "New clinical note / summary"} onClose={resetNoteComposer}>
            {noteError && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{noteError}</div>}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Document type</label><p className="text-[11px] text-gray-500 mt-0.5">Document type and author role are separate. Consultants, RMOs and Nursing staff can each create Progress Notes or Initial Assessments.</p>
                <select value={noteType} onChange={(e) => setNoteType(e.target.value)} className="w-full h-10 px-3 rounded-lg border text-sm">
                  {["Progress Note","Initial Assessment","Procedure Note","Case Summary","Referral","Consent","Discharge Note"].map(x => <option key={x}>{x}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-gray-500">Title</label><input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} className="w-full h-10 px-3 rounded-lg border text-sm" placeholder="Optional title" /></div>
              <div><label className="text-xs text-gray-500">Clinical content</label><textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} className="w-full min-h-[180px] px-3 py-2 rounded-lg border text-sm" placeholder="Write the clinical note or summary…" /></div>
              <div className="rounded-lg bg-amber-50 text-amber-800 text-xs px-3 py-2">
                Final signing requires a second active clinician. The author cannot approve their own document. Once FINAL, the content is locked; later corrections must be documented as a new/addendum note.
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={resetNoteComposer} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button>
                <button type="button" disabled={noteSaving || !noteContent.trim()} onClick={() => saveClinicalNote(false)} className="flex-1 h-11 rounded-lg border text-sm disabled:opacity-60">Save draft</button>
                {!editingNoteId && <button type="button" disabled={noteSaving || !noteContent.trim()} onClick={() => saveClinicalNote(true)} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-60">Submit for verification</button>}
              </div>
            </div>
          </Modal>
        )}

        {showFollowUp && p && (
          <Modal title={`Schedule follow-up — ${p.name}`} onClose={() => setShowFollowUp(false)}>
            {followError && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{followError}</div>}
            <form onSubmit={scheduleFollowUp} className="space-y-3">
              <div><label className="text-xs text-gray-500">Date</label><input required type="date" value={follow.date} onChange={(e) => setFollow({ ...follow, date: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
              <div><label className="text-xs text-gray-500">Time</label><input required type="time" value={follow.time} onChange={(e) => setFollow({ ...follow, time: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowFollowUp(false)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button>
                <button type="submit" disabled={followSaving} className="flex-1 h-11 rounded-lg bg-[#140a1f] text-white text-sm font-medium disabled:opacity-60">{followSaving ? "Saving…" : "Schedule"}</button>
              </div>
            </form>
          </Modal>
        )}
      </>
    </AppShell>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white overflow-hidden">
      <div className="px-3 py-2 border-b bg-[#f8f6fa] text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</div>
      <div>{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-3 py-4 text-xs text-gray-400">{text}</p>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3 print:hidden">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-base">{title}</h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-500">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
