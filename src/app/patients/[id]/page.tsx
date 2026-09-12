"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatientDetail, apiCreateEncounter, apiAddPrescriptionWithEncounter, apiAddInvoice, apiAddAppointment, apiCreateLabOrder, apiCreateDiagnosticOrder } from "@/lib/api";

type TimelineItem = { date: string; kind: string; title: string; detail?: string; sort: number };

const COMMON_LAB_TESTS = ["CBC", "LFT", "KFT", "Lipid Profile", "HbA1c", "TSH", "Urine Routine", "Blood Sugar"];
const COMMON_DIAGNOSTICS = [
  { studyName: "Chest X-ray", modality: "X-ray" },
  { studyName: "Ultrasound Abdomen", modality: "Ultrasound" },
  { studyName: "CT Head", modality: "CT" },
  { studyName: "MRI Brain", modality: "MRI" },
  { studyName: "ECG", modality: "ECG" },
  { studyName: "2D Echo", modality: "Echo" },
];

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get("appointmentId") || undefined;
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [data, setData] = useState<any>(null);
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
    bp: "", pulse: "", temperature: "", spo2: "", weight: "", height: "", medicines: "", advice: "", billAmount: "",
  });
  const [selectedLabs, setSelectedLabs] = useState<string[]>([]);
  const [selectedDiagnostics, setSelectedDiagnostics] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setData(await apiGetPatientDetail(id));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) { router.replace("/login"); return; }
    load();
  }, [doctor, authLoading, router, load]);

  const bmi = useMemo(() => {
    const w = parseFloat(form.weight), h = parseFloat(form.height);
    if (!w || !h || h <= 0) return null;
    return (w / Math.pow(h / 100, 2)).toFixed(1);
  }, [form.weight, form.height]);

  const p = data?.patient;
  const lastEncounter = data?.encounters?.[0];
  const lastVitals = lastEncounter && [lastEncounter.bp && `BP ${lastEncounter.bp}`, lastEncounter.pulse && `P ${lastEncounter.pulse}`, lastEncounter.temperature && `T ${lastEncounter.temperature}`, lastEncounter.spo2 && `SpO₂ ${lastEncounter.spo2}`, lastEncounter.weight && `Wt ${lastEncounter.weight}kg`].filter(Boolean).join(" · ");

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!data) return [];
    const items: TimelineItem[] = [];
    (data.encounters || []).forEach((e: any) => items.push({ date: e.date, kind: "Consultation", title: e.chiefComplaint || e.diagnosis || "Clinical encounter", detail: [e.diagnosis && `Dx: ${e.diagnosis}`, e.plan && `Plan: ${e.plan}`].filter(Boolean).join(" · "), sort: new Date(e.createdAt || e.date).getTime() }));
    (data.prescriptions || []).forEach((r: any) => items.push({ date: new Date(r.createdAt).toLocaleDateString(), kind: "Prescription", title: "Prescription issued", detail: r.medicines, sort: new Date(r.createdAt).getTime() }));
    (data.labOrders || []).forEach((l: any) => items.push({ date: new Date(l.orderedAt || l.createdAt).toLocaleDateString(), kind: "Lab", title: `${l.testName} · ${l.status}`, detail: [l.category, l.status === "Resulted" && l.result ? `Result: ${l.result}` : null, l.notes].filter(Boolean).join(" · "), sort: new Date(l.resultedAt || l.orderedAt || l.createdAt).getTime() }));
    (data.diagnosticOrders || []).forEach((d: any) => items.push({ date: new Date(d.reportedAt || d.performedAt || d.orderedAt || d.createdAt).toLocaleDateString(), kind: "Diagnostic", title: `${d.studyName} · ${d.status}`, detail: [d.modality, d.bodyPart && `Body part: ${d.bodyPart}`, d.indication && `Indication: ${d.indication}`, d.findings && `Findings: ${d.findings}`, d.impression && `Impression: ${d.impression}`, d.notes].filter(Boolean).join(" · "), sort: new Date(d.reportedAt || d.performedAt || d.orderedAt || d.createdAt).getTime() }));
    (data.appointments || []).forEach((a: any) => items.push({ date: a.date, kind: "Appointment", title: `${a.type || "Appointment"} · ${a.status}`, detail: a.time, sort: new Date(`${a.date}T${a.time || "00:00"}`).getTime() }));
    (data.invoices || []).forEach((i: any) => items.push({ date: new Date(i.createdAt).toLocaleDateString(), kind: "Billing", title: `₹${i.amount}`, detail: i.note || "Fee", sort: new Date(i.createdAt).getTime() }));
    return items.sort((a, b) => b.sort - a.sort);
  }, [data]);

  const handleSaveConsult = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setSaving(true);
    try {
      const enc = await apiCreateEncounter({ patientId: id, appointmentId, chiefComplaint: form.chiefComplaint, clinicalNotes: form.clinicalNotes, diagnosis: form.diagnosis, assessment: form.assessment, plan: form.plan, followUpDate: form.followUpDate || undefined, bp: form.bp, pulse: form.pulse, temperature: form.temperature, spo2: form.spo2, weight: form.weight, height: form.height });
      if (!enc.success || !enc.encounter) { setError(enc.error || "Could not save consultation"); return; }
      if (selectedLabs.length) {
        const labResults = await Promise.all(selectedLabs.map((testName) => apiCreateLabOrder({ patientId: id, testName, category: "Laboratory", encounterId: enc.encounter.id })));
        const failedLab = labResults.find((r) => !r.success);
        if (failedLab) { setError(failedLab.error || "Consultation saved, but one or more lab orders could not be created"); return; }
      }
      if (selectedDiagnostics.length) {
        const diagnosticResults = await Promise.all(selectedDiagnostics.map((studyName) => {
          const study = COMMON_DIAGNOSTICS.find((x) => x.studyName === studyName);
          return apiCreateDiagnosticOrder({ patientId: id, studyName, modality: study?.modality || "Other", indication: form.diagnosis || form.chiefComplaint || undefined, encounterId: enc.encounter.id });
        }));
        const failedDiagnostic = diagnosticResults.find((r) => !r.success);
        if (failedDiagnostic) { setError(failedDiagnostic.error || "Consultation saved, but one or more diagnostic orders could not be created"); return; }
      }
      if (form.medicines.trim()) await apiAddPrescriptionWithEncounter({ patientId: id, patientName: data?.patient?.name || "", medicines: form.medicines.trim(), advice: form.advice.trim(), encounterId: enc.encounter.id });
      const amt = parseFloat(form.billAmount);
      if (amt > 0) await apiAddInvoice({ patientId: id, items: [{ description: "Consultation fee", category: "Service", quantity: 1, unitPrice: amt }], note: form.diagnosis ? `Consultation: ${form.diagnosis}` : "Consultation fee" });
      const createdParts = [selectedLabs.length ? `${selectedLabs.length} lab order${selectedLabs.length > 1 ? "s" : ""}` : "", selectedDiagnostics.length ? `${selectedDiagnostics.length} diagnostic order${selectedDiagnostics.length > 1 ? "s" : ""}` : ""].filter(Boolean);
      setShowConsult(false); setMsg(createdParts.length ? `Consultation saved · ${createdParts.join(" + ")} created` : "Consultation saved"); setTimeout(() => setMsg(""), 2500);
      setSelectedLabs([]); setSelectedDiagnostics([]);
      setForm({ chiefComplaint: "", clinicalNotes: "", diagnosis: "", assessment: "", plan: "", followUpDate: "", bp: "", pulse: "", temperature: "", spo2: "", weight: "", height: "", medicines: "", advice: "", billAmount: "" });
      await load();
    } catch { setError("Network error"); } finally { setSaving(false); }
  };

  const scheduleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault(); setFollowError(""); setFollowSaving(true);
    try {
      const res = await apiAddAppointment({ patientId: id, patientName: p?.name || "", date: follow.date, time: follow.time, type: follow.type });
      if (!res.success) { setFollowError(res.error || "Could not schedule follow-up"); return; }
      setShowFollowUp(false); setMsg("Follow-up scheduled"); setTimeout(() => setMsg(""), 2500); await load();
    } catch { setFollowError("Network error"); } finally { setFollowSaving(false); }
  };

  if (authLoading || !doctor) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;

  return (
    <AppShell>
      <div className="mb-3 print:hidden"><Link href="/dashboard" className="text-xs text-[#c2183a]">← Patients</Link></div>
      {loading || !p ? <div className="p-6 text-center text-gray-400 text-sm">{loading ? "Loading…" : "Patient not found"}</div> : <>
        <div className="flex items-start justify-between gap-2 mb-3 print:hidden">
          <div><h2 className="text-lg font-semibold">{p.name}</h2><p className="text-xs text-gray-500">{p.age} yrs · {p.gender} · {p.phone}</p></div>
          <div className="flex gap-2 shrink-0"><button type="button" onClick={() => window.print()} className="h-9 px-3 rounded-lg border text-sm">Print Rx</button><button type="button" onClick={() => { setError(""); setSelectedLabs([]); setSelectedDiagnostics([]); setShowConsult(true); }} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-sm font-medium">Start Consult</button></div>
        </div>

        <div id="medlum-print-area" className="bg-white rounded-xl shadow-sm border p-3 mb-3 print:shadow-none print:border-0">
          <div className="hidden print:block mb-4 border-b pb-3"><h1 className="text-xl font-bold">{doctor.clinicName || "MedLum Clinic"}</h1><p className="text-sm">Prescription / Clinical Record</p></div>
          <div className="flex flex-wrap gap-2 mb-2">
            {p.allergies ? <span className="px-2 py-1 rounded-full bg-red-50 text-red-700 text-xs">⚠ Allergy: {p.allergies}</span> : <span className="px-2 py-1 rounded-full bg-gray-50 text-gray-500 text-xs">No allergy recorded</span>}
            {p.bp && <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-xs">Baseline BP: {p.bp}</span>}
          </div>
          <div className="print:block hidden mb-3"><b>Patient:</b> {p.name} · {p.age} yrs · {p.gender} · {p.phone}</div>
          {lastEncounter ? <div className="border-t pt-2"><p className="text-[11px] uppercase tracking-wide text-gray-400">Latest clinical context · {lastEncounter.date}</p>{lastEncounter.chiefComplaint && <p className="text-sm mt-1"><b>Complaint:</b> {lastEncounter.chiefComplaint}</p>}{lastEncounter.diagnosis && <p className="text-sm"><b>Diagnosis:</b> {lastEncounter.diagnosis}</p>}{lastVitals && <p className="text-xs text-gray-500 mt-1">Vitals: {lastVitals}</p>}{lastEncounter.followUpDate && <p className="text-xs text-[#c2183a] mt-1">Follow-up: {lastEncounter.followUpDate}</p>}</div> : <p className="text-xs text-gray-400">No previous consultation recorded.</p>}
        </div>

        {msg && <div className="mb-3 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm print:hidden">{msg}</div>}

        <div className="space-y-3 print:hidden">
          <Sec title="Clinical Timeline">
            {!timeline.length ? <Empty text="No clinical activity yet." /> : timeline.map((x, i) => <div key={`${x.kind}-${x.date}-${i}`} className="px-3 py-3 border-b last:border-0 flex gap-3"><div className="w-2 rounded-full bg-[#c2183a] shrink-0" /><div className="min-w-0"><div className="flex flex-wrap gap-2 items-center"><span className="text-[11px] uppercase tracking-wide text-gray-400">{x.kind}</span><span className="text-xs text-gray-400">{x.date}</span></div><p className="text-sm font-medium mt-0.5">{x.title}</p>{x.detail && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{x.detail}</p>}</div></div>)}
          </Sec>

          <Sec title="Consultations">
            {!data.encounters?.length ? <Empty text="No consultations yet." /> : data.encounters.map((e: any) => <div key={e.id} className="px-3 py-2.5 border-b last:border-0"><p className="text-xs text-gray-400">{e.date}</p>{e.chiefComplaint && <p className="text-sm mt-0.5"><b>Complaint:</b> {e.chiefComplaint}</p>}{e.diagnosis && <p className="text-sm"><b>Dx:</b> {e.diagnosis}</p>}{e.assessment && <p className="text-xs text-gray-600"><b>Assessment:</b> {e.assessment}</p>}{e.plan && <p className="text-xs text-gray-600"><b>Plan:</b> {e.plan}</p>}{e.clinicalNotes && <p className="text-xs text-gray-600 mt-0.5">{e.clinicalNotes}</p>}{(e.bp || e.pulse || e.temperature || e.spo2 || e.weight) && <p className="text-xs text-gray-500 mt-0.5">Vitals: {[e.bp && `BP ${e.bp}`, e.pulse && `P ${e.pulse}`, e.temperature && `T ${e.temperature}`, e.spo2 && `SpO2 ${e.spo2}`, e.weight && `Wt ${e.weight}kg`].filter(Boolean).join(" · ")}</p>}{e.followUpDate && <p className="text-xs text-[#c2183a] mt-0.5">Follow-up: {e.followUpDate}</p>}</div>)}
          </Sec>

          <Sec title="Lab Orders & Results">
            {!data.labOrders?.length ? <Empty text="No lab orders yet." /> : data.labOrders.map((l: any) => <div key={l.id} className="px-3 py-2.5 border-b last:border-0"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{l.testName}</p><p className="text-xs text-gray-500">{l.category} · Ordered {new Date(l.orderedAt || l.createdAt).toLocaleDateString()}</p></div><span className="text-xs">{l.status}</span></div>{l.result && <p className="text-sm mt-1"><b>Result:</b> {l.result}</p>}{l.notes && <p className="text-xs text-gray-500 mt-0.5">{l.notes}</p>}</div>)}
          </Sec>

          <Sec title="Diagnostics & Reports">
            {!data.diagnosticOrders?.length ? <Empty text="No diagnostic studies yet." /> : data.diagnosticOrders.map((d: any) => <div key={d.id} className="px-3 py-2.5 border-b last:border-0"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{d.studyName}</p><p className="text-xs text-gray-500">{d.modality}{d.bodyPart ? ` · ${d.bodyPart}` : ""} · Ordered {new Date(d.orderedAt || d.createdAt).toLocaleDateString()}</p></div><span className="text-xs">{d.status}</span></div>{d.indication && <p className="text-xs text-gray-600 mt-1"><b>Indication:</b> {d.indication}</p>}{d.findings && <p className="text-sm mt-1"><b>Findings:</b> {d.findings}</p>}{d.impression && <p className="text-sm mt-1"><b>Impression:</b> {d.impression}</p>}{d.notes && <p className="text-xs text-gray-500 mt-0.5">{d.notes}</p>}</div>)}
          </Sec>

          <Sec title="Prescriptions">
            <div className="px-3 py-2 border-b flex justify-end"><button type="button" onClick={() => window.print()} className="text-xs px-3 py-1.5 rounded-lg border">Print current record</button></div>
            {!data.prescriptions?.length ? <Empty text="No prescriptions." /> : data.prescriptions.map((r: any) => <div key={r.id} className="px-3 py-2.5 border-b last:border-0"><p className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</p><p className="text-sm whitespace-pre-wrap mt-0.5">{r.medicines}</p>{r.advice && <p className="text-xs text-gray-500">Advice: {r.advice}</p>}</div>)}
          </Sec>

          <Sec title="Follow-up & Appointments">
            <div className="px-3 py-2 border-b flex justify-end"><button type="button" onClick={() => { setFollowError(""); setFollow({ date: lastEncounter?.followUpDate || "", time: "10:00", type: "Follow-up" }); setShowFollowUp(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-[#c2183a] text-white">Schedule Follow-up</button></div>
            {!data.appointments?.length ? <Empty text="No appointments." /> : data.appointments.map((a: any) => <div key={a.id} className="px-3 py-2.5 border-b last:border-0 flex justify-between gap-3"><div><p className="text-sm">{a.date} · {a.time}</p><p className="text-xs text-gray-500">{a.type}</p></div><span className="text-xs">{a.status}</span></div>)}
          </Sec>

          <Sec title="Billing">
            {!data.invoices?.length ? <Empty text="No invoices." /> : data.invoices.map((i: any) => <div key={i.id} className="px-3 py-2.5 border-b last:border-0 flex justify-between"><div><p className="text-sm">₹{i.amount}</p><p className="text-xs text-gray-500">{i.note || "Fee"}</p></div><span className="text-xs">{i.status}</span></div>)}
          </Sec>
        </div>

        {showConsult && p && <Modal title={`Consultation — ${p.name}`} onClose={() => setShowConsult(false)}>
          <p className="text-xs text-gray-500 mb-3">Complaint → Vitals → Diagnosis → Labs → Diagnostics → Rx → Follow-up → Bill</p>
          {error && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
          <form onSubmit={handleSaveConsult} className="space-y-2.5">
            <textarea required rows={2} placeholder="Chief complaint *" value={form.chiefComplaint} onChange={e => setForm({ ...form, chiefComplaint: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" />
            <textarea rows={2} placeholder="Clinical notes" value={form.clinicalNotes} onChange={e => setForm({ ...form, clinicalNotes: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" />
            <input placeholder="Diagnosis" value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" />
            <div className="grid grid-cols-2 gap-2"><input placeholder="Assessment" value={form.assessment} onChange={e => setForm({ ...form, assessment: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /><input placeholder="Plan" value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
            <p className="text-xs font-medium text-gray-600 pt-1">Vitals</p>
            <div className="grid grid-cols-3 gap-2">{([["bp","BP"],["pulse","Pulse"],["temperature","Temp °C"],["spo2","SpO2 %"],["weight","Weight kg"],["height","Height cm"]] as const).map(([k, ph]) => <input key={k} placeholder={ph} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} className="h-10 px-2 rounded-lg border text-sm" />)}</div>
            {bmi && <p className="text-xs text-gray-500">BMI: {bmi}</p>}
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between gap-2 mb-2"><p className="text-xs font-medium text-gray-700">Order laboratory tests</p>{selectedLabs.length > 0 && <span className="text-[11px] text-[#c2183a]">{selectedLabs.length} selected</span>}</div>
              <div className="grid grid-cols-2 gap-2">{COMMON_LAB_TESTS.map((test) => <label key={test} className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={selectedLabs.includes(test)} onChange={(e) => setSelectedLabs(e.target.checked ? [...selectedLabs, test] : selectedLabs.filter((x) => x !== test))} />{test}</label>)}</div>
              <p className="text-[11px] text-gray-400 mt-2">Orders are linked to this consultation and appear in the patient timeline.</p>
            </div>
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between gap-2 mb-2"><p className="text-xs font-medium text-gray-700">Order diagnostic studies</p>{selectedDiagnostics.length > 0 && <span className="text-[11px] text-[#c2183a]">{selectedDiagnostics.length} selected</span>}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{COMMON_DIAGNOSTICS.map((study) => <label key={study.studyName} className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={selectedDiagnostics.includes(study.studyName)} onChange={(e) => setSelectedDiagnostics(e.target.checked ? [...selectedDiagnostics, study.studyName] : selectedDiagnostics.filter((x) => x !== study.studyName))} /><span>{study.studyName}</span><span className="text-[10px] text-gray-400">{study.modality}</span></label>)}</div>
              <p className="text-[11px] text-gray-400 mt-2">Orders are linked to this consultation. Reports and impressions appear in the patient timeline.</p>
            </div>
            <p className="text-xs font-medium text-gray-600 pt-1">Prescription (optional)</p>
            <textarea rows={3} placeholder="Medicines (one per line)" value={form.medicines} onChange={e => setForm({ ...form, medicines: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" />
            <input placeholder="Advice" value={form.advice} onChange={e => setForm({ ...form, advice: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" />
            <div className="grid grid-cols-2 gap-2"><div><label className="text-xs text-gray-500">Follow-up</label><input type="date" value={form.followUpDate} onChange={e => setForm({ ...form, followUpDate: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div><div><label className="text-xs text-gray-500">Bill ₹</label><input type="number" min="0" value={form.billAmount} onChange={e => setForm({ ...form, billAmount: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" placeholder="0" /></div></div>
            <div className="flex gap-2 pt-1"><button type="button" disabled={saving} onClick={() => setShowConsult(false)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button><button type="submit" disabled={saving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-60">{saving ? "Saving…" : "Save Consultation"}</button></div>
          </form>
        </Modal>}

        {showFollowUp && p && <Modal title={`Schedule follow-up — ${p.name}`} onClose={() => setShowFollowUp(false)}>
          {followError && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{followError}</div>}
          <form onSubmit={scheduleFollowUp} className="space-y-3"><div><label className="text-xs text-gray-500">Date</label><input required type="date" value={follow.date} onChange={e => setFollow({ ...follow, date: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div><div className="grid grid-cols-2 gap-2"><div><label className="text-xs text-gray-500">Time</label><input required type="time" value={follow.time} onChange={e => setFollow({ ...follow, time: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div><div><label className="text-xs text-gray-500">Type</label><input value={follow.type} onChange={e => setFollow({ ...follow, type: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div></div><div className="flex gap-2"><button type="button" onClick={() => setShowFollowUp(false)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button><button type="submit" disabled={followSaving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium">{followSaving ? "Scheduling…" : "Schedule"}</button></div></form>
        </Modal>}
      </>}
    </AppShell>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-3"><div className="bg-white rounded-2xl w-full max-w-lg p-4 shadow-xl max-h-[92vh] overflow-y-auto"><div className="flex items-center justify-between mb-2"><h3 className="text-base font-semibold">{title}</h3><button type="button" onClick={onClose} className="text-gray-400 text-lg">×</button></div>{children}</div></div>; }
function Sec({ title, children }: { title: string; children: React.ReactNode }) { return <div className="bg-white rounded-xl shadow-sm border overflow-hidden"><div className="px-3 py-2 border-b"><h3 className="font-semibold text-sm">{title}</h3></div>{children}</div>; }
function Empty({ text }: { text: string }) { return <div className="p-4 text-center text-gray-400 text-xs">{text}</div>; }