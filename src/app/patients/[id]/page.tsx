"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import AbhaPatientPanel from "@/components/AbhaPatientPanel";
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
    void load();
  }, [authLoading, doctor, load, router]);

  const p = data?.patient;
  const lastEncounter = data?.encounters?.[0];
  const lastVitals = lastEncounter
    ? [lastEncounter.bp && `BP ${lastEncounter.bp}`, lastEncounter.pulse && `P ${lastEncounter.pulse}`, lastEncounter.temperature && `T ${lastEncounter.temperature}`, lastEncounter.spo2 && `SpO2 ${lastEncounter.spo2}`, lastEncounter.weight && `Wt ${lastEncounter.weight}`].filter(Boolean).join(" · ")
    : "";

  const timeline = useMemo(() => {
    if (!data) return [] as TimelineItem[];
    const items: TimelineItem[] = [];
    (data.encounters || []).forEach((e: any) => items.push({ date: e.date, kind: "Consult", title: e.diagnosis || e.chiefComplaint || "Consultation", detail: e.clinicalNotes, sort: new Date(e.createdAt).getTime() }));
    (data.labOrders || []).forEach((l: any) => items.push({ date: new Date(l.orderedAt).toLocaleDateString(), kind: "Lab", title: l.testName, detail: l.result || l.status, sort: new Date(l.orderedAt).getTime() }));
    (data.diagnosticOrders || []).forEach((d: any) => items.push({ date: new Date(d.orderedAt).toLocaleDateString(), kind: "Dx", title: d.studyName, detail: d.impression || d.status, sort: new Date(d.orderedAt).getTime() }));
    (data.prescriptions || []).forEach((r: any) => items.push({ date: new Date(r.createdAt).toLocaleDateString(), kind: "Rx", title: "Prescription", detail: r.medicines, sort: new Date(r.createdAt).getTime() }));
    (data.appointments || []).forEach((a: any) => items.push({ date: a.date, kind: "Appt", title: `${a.type} · ${a.time}`, detail: a.status, sort: new Date(a.createdAt).getTime() }));
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
      setMsg("Consultation saved.");
      setShowConsult(false);
      await load();
    } catch {
      setError("Could not save consultation");
    } finally {
      setSaving(false);
    }
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
            {(p.uhid || p.registrationNo) && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                {p.uhid ? `UHID ${p.uhid}` : ""}{p.uhid && p.registrationNo ? " · " : ""}{p.registrationNo ? `Reg ${p.registrationNo}` : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowConsult(true)} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-xs font-medium">New consult</button>
            <button type="button" onClick={() => setShowFollowUp(true)} className="h-9 px-3 rounded-lg border text-xs font-medium">Follow-up</button>
            <Link href="/patients" className="h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center">Back</Link>
          </div>
        </div>

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

          <Sec title="Clinical Timeline">
            {!timeline.length ? <Empty text="No clinical activity yet." /> : timeline.map((x, i) => (
              <div key={`${x.kind}-${x.date}-${i}`} className="px-3 py-3 border-b last:border-0 flex gap-3">
                <div className="w-2 rounded-full bg-[#c2183a] shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[11px] uppercase tracking-wide text-gray-400">{x.kind}</span>
                    <span className="text-xs text-gray-400">{x.date}</span>
                  </div>
                  <p className="text-sm font-medium mt-0.5">{x.title}</p>
                  {x.detail && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{x.detail}</p>}
                </div>
              </div>
            ))}
          </Sec>

          <Sec title="Consultations">
            {!data.encounters?.length ? <Empty text="No consultations yet." /> : data.encounters.map((e: any) => (
              <div key={e.id} className="px-3 py-2.5 border-b last:border-0">
                <p className="text-xs text-gray-400">{e.date}</p>
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
                <p className="text-sm font-medium">{l.testName} <span className="text-xs text-gray-400 font-normal">{l.status}</span></p>
                {l.result && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{l.result}</p>}
              </div>
            ))}
          </Sec>

          <Sec title="Diagnostics & Reports">
            {!data.diagnosticOrders?.length ? <Empty text="No diagnostics." /> : data.diagnosticOrders.map((d: any) => (
              <div key={d.id} className="px-3 py-2.5 border-b last:border-0">
                <p className="text-sm font-medium">{d.studyName} <span className="text-xs text-gray-400 font-normal">{d.modality} · {d.status}</span></p>
                {d.impression && <p className="text-xs text-gray-600 mt-0.5">{d.impression}</p>}
              </div>
            ))}
          </Sec>

          <Sec title="Prescriptions">
            {!data.prescriptions?.length ? <Empty text="No prescriptions." /> : data.prescriptions.map((r: any) => (
              <div key={r.id} className="px-3 py-2.5 border-b last:border-0">
                <p className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                <p className="text-sm whitespace-pre-wrap">{r.medicines}</p>
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
            {error && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <form onSubmit={handleSaveConsult} className="space-y-3">
              <div><label className="text-xs text-gray-500">Chief complaint</label><input value={form.chiefComplaint} onChange={(e) => setForm({ ...form, chiefComplaint: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
              <div><label className="text-xs text-gray-500">Diagnosis</label><input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
              <div><label className="text-xs text-gray-500">Clinical notes</label><textarea value={form.clinicalNotes} onChange={(e) => setForm({ ...form, clinicalNotes: e.target.value })} className="w-full min-h-[72px] px-3 py-2 rounded-lg border text-sm" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500">BP</label><input value={form.bp} onChange={(e) => setForm({ ...form, bp: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
                <div><label className="text-xs text-gray-500">Pulse</label><input value={form.pulse} onChange={(e) => setForm({ ...form, pulse: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
              </div>
              <div><label className="text-xs text-gray-500">Medicines</label><textarea value={form.medicines} onChange={(e) => setForm({ ...form, medicines: e.target.value })} className="w-full min-h-[64px] px-3 py-2 rounded-lg border text-sm" placeholder="One per line" /></div>
              <div><label className="text-xs text-gray-500">Labs</label><div className="flex flex-wrap gap-1.5 mt-1">{COMMON_LAB_TESTS.map((t) => (<label key={t} className="text-xs border rounded-full px-2 py-1 cursor-pointer"><input type="checkbox" className="mr-1" checked={selectedLabs.includes(t)} onChange={(e) => setSelectedLabs((prev) => e.target.checked ? [...prev, t] : prev.filter((x) => x !== t))} />{t}</label>))}</div></div>
              <div><label className="text-xs text-gray-500">Diagnostics</label><div className="flex flex-wrap gap-1.5 mt-1">{COMMON_DIAGNOSTICS.map((d) => (<label key={d.studyName} className="text-xs border rounded-full px-2 py-1 cursor-pointer"><input type="checkbox" className="mr-1" checked={selectedDiagnostics.includes(d.studyName)} onChange={(e) => setSelectedDiagnostics((prev) => e.target.checked ? [...prev, d.studyName] : prev.filter((x) => x !== d.studyName))} />{d.studyName}</label>))}</div></div>
              <div><label className="text-xs text-gray-500">Bill amount (₹)</label><input type="number" min="0" step="1" value={form.billAmount} onChange={(e) => setForm({ ...form, billAmount: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowConsult(false)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-60">{saving ? "Saving…" : "Save Consultation"}</button>
              </div>
            </form>
          </Modal>
        )}

        {showFollowUp && p && (
          <Modal title={`Schedule follow-up — ${p.name}`} onClose={() => setShowFollowUp(false)}>
            {followError && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{followError}</div>}
            <form onSubmit={scheduleFollowUp} className="space-y-3">
              <div><label className="text-xs text-gray-500">Date</label><input required type="date" value={follow.date} onChange={(e) => setFollow({ ...follow, date: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500">Time</label><input required type="time" value={follow.time} onChange={(e) => setFollow({ ...follow, time: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
                <div><label className="text-xs text-gray-500">Type</label><input value={follow.type} onChange={(e) => setFollow({ ...follow, type: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowFollowUp(false)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button>
                <button type="submit" disabled={followSaving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium">{followSaving ? "Scheduling…" : "Schedule"}</button>
              </div>
            </form>
          </Modal>
        )}
      </>
    </AppShell>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-3">
      <div className="bg-white rounded-2xl w-full max-w-lg p-4 shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 text-lg">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="px-3 py-2 border-b"><h3 className="font-semibold text-sm">{title}</h3></div>
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="p-4 text-center text-gray-400 text-xs">{text}</div>;
}
