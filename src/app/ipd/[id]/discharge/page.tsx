"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

export default function IPDDischargePage() {
  const { id } = useParams<{ id: string }>();
  const { doctor, loading: authLoading } = useDoctor();
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ diagnosis: "", presentingComplaints: "", courseInHospital: "", procedures: "", investigations: "", medicationsDuringStay: "", conditionOnDischarge: "", advice: "", followUpAdvice: "", dischargeDateTime: "" });

  useEffect(() => {
    if (authLoading || !doctor || !id) return;
    fetch("/api/ipd", { credentials: "include", cache: "no-store" }).then(async r => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not load IPD record");
      const p = [...(d.patients || []), ...(d.ipdHistory || [])].find((x: any) => x.id === id);
      if (!p) throw new Error("Patient record not found");
      setPatient(p);
      setFinalized(p.status === "DISCHARGED");
      setForm(f => ({ ...f, diagnosis: p.diagnosis || p.workingDiagnosis || "", presentingComplaints: p.chiefComplaint || "", dischargeDateTime: new Date().toISOString().slice(0, 16) }));
    }).catch(e => setError(e.message || "Could not load discharge record")).finally(() => setLoading(false));
  }, [authLoading, doctor, id]);

  function set(key: string, value: string) { setForm(f => ({ ...f, [key]: value })); }

  async function finalize() {
    if (!patient || finalized) return;
    if (!window.confirm(`Finalize the discharge summary and discharge ${patient.name} from the active IPD census? The UHID and historical clinical record will be retained.`)) return;
    setSaving(true); setError(""); setMsg("");
    try {
      const content = [
        `Date and Time of Discharge: ${form.dischargeDateTime}`,
        `Diagnosis: ${form.diagnosis}`,
        `Presenting Complaints: ${form.presentingComplaints}`,
        `Course In Hospital: ${form.courseInHospital}`,
        `Procedures: ${form.procedures}`,
        `Investigations: ${form.investigations}`,
        `Medications During Stay: ${form.medicationsDuringStay}`,
        `Condition on Discharge: ${form.conditionOnDischarge}`,
        `Advice: ${form.advice}`,
        `Follow Up Advice: ${form.followUpAdvice}`,
      ].join("\n");

      const noteR = await fetch("/api/ipd", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clinical-note", patientId: patient.id, noteType: "Discharge Summary", title: "Final Discharge Summary", content, authorRole: `${doctor?.name || "Clinician"} · Discharge Summary` }) });
      const noteD = await noteR.json().catch(() => ({}));
      if (!noteR.ok || !noteD.success) throw new Error(noteD.error || "Could not save final discharge summary");

      const dischargeR = await fetch("/api/patients/lifecycle", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId: patient.id, action: "discharge", reason: "Final discharge summary completed" }) });
      const dischargeD = await dischargeR.json().catch(() => ({}));
      if (!dischargeR.ok || !dischargeD.success) throw new Error(dischargeD.error || "Could not complete patient discharge");

      setFinalized(true);
      setPatient((p: any) => ({ ...p, status: "DISCHARGED" }));
      setMsg("Discharge finalized. The patient has left the active IPD census; the UHID and complete clinical history remain available.");
    } catch (e: any) { setError(e.message || "Discharge failed"); }
    finally { setSaving(false); }
  }

  if (authLoading || loading) return <AppShell><div className="p-6 text-sm text-gray-500">Loading discharge workflow…</div></AppShell>;
  if (!doctor) return <AppShell><div className="p-6 text-sm text-gray-500">Sign in to complete discharge.</div></AppShell>;

  return <AppShell><div className="p-4 max-w-4xl mx-auto">
    <div className="flex items-start justify-between gap-3 mb-4"><div><p className="text-[10px] uppercase tracking-wide text-[#c2183a] font-semibold">IPD Discharge</p><h1 className="text-xl font-bold">Final Discharge Summary</h1><p className="text-xs text-gray-500">{patient?.name} · UHID {patient?.uhid || "—"}</p></div><Link href={`/ipd/${id}/clinical`} className="h-9 px-3 rounded-lg border text-xs inline-flex items-center">Back to workspace</Link></div>
    {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    {msg && <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</div>}
    <section className="rounded-2xl border bg-white p-4 space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-xs font-semibold">Discharge date/time<input type="datetime-local" value={form.dischargeDateTime} disabled={finalized} onChange={e=>set("dischargeDateTime",e.target.value)} className="mt-1 w-full h-9 rounded-lg border px-2 font-normal"/></label>
        <label className="text-xs font-semibold">Diagnosis<input value={form.diagnosis} disabled={finalized} onChange={e=>set("diagnosis",e.target.value)} className="mt-1 w-full h-9 rounded-lg border px-2 font-normal"/></label>
      </div>
      {([["presentingComplaints","Presenting complaints"],["courseInHospital","Course in hospital"],["procedures","Procedures"],["investigations","Investigations / results"],["medicationsDuringStay","Medications during stay"],["conditionOnDischarge","Condition on discharge"],["advice","Advice"],["followUpAdvice","Follow-up advice"]] as const).map(([k,label])=><label key={k} className="block text-xs font-semibold">{label}<textarea value={form[k]} disabled={finalized} onChange={e=>set(k,e.target.value)} className="mt-1 w-full min-h-16 rounded-lg border px-2 py-2 font-normal"/></label>)}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {!finalized ? <button type="button" onClick={finalize} disabled={saving} className="h-10 rounded-xl bg-[#c2183a] px-4 text-xs font-semibold text-white">{saving ? "Finalizing…" : "Finalize & Discharge Patient"}</button> : <span className="h-10 rounded-xl bg-gray-100 px-4 inline-flex items-center text-xs font-semibold text-gray-700">DISCHARGED</span>}
        {finalized && <Link href={`/ipd-summaries/${id}/print`} target="_blank" className="h-10 rounded-xl border px-4 inline-flex items-center text-xs font-semibold text-[#c2183a]">Print / Save PDF</Link>}
      </div>
      <p className="text-[10px] text-gray-500">Finalization removes the admission from the active IPD census but does not delete the patient or UHID history.</p>
    </section>
  </div></AppShell>;
}
