"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatientDetail, apiCreateEncounter, apiAddPrescriptionWithEncounter, apiAddInvoice } from "@/lib/api";

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get("appointmentId") || undefined;
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showConsult, setShowConsult] = useState(!!appointmentId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    chiefComplaint: "", clinicalNotes: "", diagnosis: "", assessment: "", plan: "", followUpDate: "",
    bp: "", pulse: "", temperature: "", spo2: "", weight: "", height: "", medicines: "", advice: "", billAmount: "",
  });

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

  const bmi = (() => {
    const w = parseFloat(form.weight);
    const h = parseFloat(form.height);
    if (!w || !h || h <= 0) return null;
    const m = h / 100;
    return (w / (m * m)).toFixed(1);
  })();

  const handleSaveConsult = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const enc = await apiCreateEncounter({
        patientId: id, appointmentId, chiefComplaint: form.chiefComplaint, clinicalNotes: form.clinicalNotes,
        diagnosis: form.diagnosis, assessment: form.assessment, plan: form.plan,
        followUpDate: form.followUpDate || undefined, bp: form.bp, pulse: form.pulse,
        temperature: form.temperature, spo2: form.spo2, weight: form.weight, height: form.height,
      });
      if (!enc.success || !enc.encounter) { setError(enc.error || "Could not save consultation"); setSaving(false); return; }
      if (form.medicines.trim()) {
        await apiAddPrescriptionWithEncounter({
          patientId: id, patientName: data?.patient?.name || "", medicines: form.medicines.trim(),
          advice: form.advice.trim(), encounterId: enc.encounter.id,
        });
      }
      const amt = parseFloat(form.billAmount);
      if (amt > 0) {
        await apiAddInvoice({
          patientId: id, patientName: data?.patient?.name || "", amount: amt,
          note: form.diagnosis ? `Consultation: ${form.diagnosis}` : "Consultation fee",
        });
      }
      setShowConsult(false);
      setMsg("Consultation saved");
      setTimeout(() => setMsg(""), 2500);
      setForm({ chiefComplaint: "", clinicalNotes: "", diagnosis: "", assessment: "", plan: "", followUpDate: "", bp: "", pulse: "", temperature: "", spo2: "", weight: "", height: "", medicines: "", advice: "", billAmount: "" });
      await load();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  if (authLoading || !doctor) {
    return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;
  }

  const p = data?.patient;

  return (
    <AppShell>
      <div className="mb-3"><Link href="/dashboard" className="text-xs text-[#c2183a]">← Patients</Link></div>
      {loading || !p ? (
        <div className="p-6 text-center text-gray-400 text-sm">{loading ? "Loading…" : "Patient not found"}</div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <p className="text-xs text-gray-500">{p.age} yrs · {p.gender} · {p.phone}</p>
              {(p.allergies || p.bp) && (
                <p className="text-xs text-amber-700 mt-1">
                  {p.allergies ? `Allergies: ${p.allergies}` : ""}{p.allergies && p.bp ? " · " : ""}{p.bp ? `Baseline BP: ${p.bp}` : ""}
                </p>
              )}
            </div>
            <button type="button" onClick={() => { setError(""); setShowConsult(true); }} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-sm font-medium shrink-0">Start Consult</button>
          </div>
          {msg && <div className="mb-3 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">{msg}</div>}
          <div className="space-y-3">
            <Sec title="Consultations">
              {!data.encounters?.length ? <Empty text="No consultations yet." /> : data.encounters.map((e: any) => (
                <div key={e.id} className="px-3 py-2.5 border-b last:border-0">
                  <p className="text-xs text-gray-400">{e.date}</p>
                  {e.chiefComplaint && <p className="text-sm mt-0.5"><b>Complaint:</b> {e.chiefComplaint}</p>}
                  {e.diagnosis && <p className="text-sm"><b>Dx:</b> {e.diagnosis}</p>}
                  {e.clinicalNotes && <p className="text-xs text-gray-600 mt-0.5">{e.clinicalNotes}</p>}
                  {(e.bp || e.pulse || e.temperature || e.spo2) && (
                    <p className="text-xs text-gray-500 mt-0.5">Vitals: {[e.bp && `BP ${e.bp}`, e.pulse && `P ${e.pulse}`, e.temperature && `T ${e.temperature}`, e.spo2 && `SpO2 ${e.spo2}`, e.weight && `Wt ${e.weight}kg`].filter(Boolean).join(" · ")}</p>
                  )}
                  {e.followUpDate && <p className="text-xs text-[#c2183a] mt-0.5">Follow-up: {e.followUpDate}</p>}
                </div>
              ))}
            </Sec>
            <Sec title="Prescriptions">
              {!data.prescriptions?.length ? <Empty text="No prescriptions." /> : data.prescriptions.map((r: any) => (
                <div key={r.id} className="px-3 py-2.5 border-b last:border-0">
                  <p className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                  <p className="text-sm whitespace-pre-wrap mt-0.5">{r.medicines}</p>
                  {r.advice && <p className="text-xs text-gray-500">Advice: {r.advice}</p>}
                </div>
              ))}
            </Sec>
            <Sec title="Appointments">
              {!data.appointments?.length ? <Empty text="No appointments." /> : data.appointments.map((a: any) => (
                <div key={a.id} className="px-3 py-2.5 border-b last:border-0 flex justify-between">
                  <div><p className="text-sm">{a.date} · {a.time}</p><p className="text-xs text-gray-500">{a.type}</p></div>
                  <span className="text-xs">{a.status}</span>
                </div>
              ))}
            </Sec>
            <Sec title="Billing">
              {!data.invoices?.length ? <Empty text="No invoices." /> : data.invoices.map((i: any) => (
                <div key={i.id} className="px-3 py-2.5 border-b last:border-0 flex justify-between">
                  <div><p className="text-sm">₹{i.amount}</p><p className="text-xs text-gray-500">{i.note || "Fee"}</p></div>
                  <span className="text-xs">{i.status}</span>
                </div>
              ))}
            </Sec>
          </div>
        </>
      )}

      {showConsult && p && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-3">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4 shadow-xl max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-semibold mb-1">Consultation — {p.name}</h3>
            <p className="text-xs text-gray-500 mb-3">Complaint → Vitals → Diagnosis → Rx → Bill</p>
            {error && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <form onSubmit={handleSaveConsult} className="space-y-2.5">
              <textarea required rows={2} placeholder="Chief complaint *" value={form.chiefComplaint} onChange={(e) => setForm({ ...form, chiefComplaint: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" />
              <textarea rows={2} placeholder="Clinical notes" value={form.clinicalNotes} onChange={(e) => setForm({ ...form, clinicalNotes: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" />
              <input placeholder="Diagnosis" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Assessment" value={form.assessment} onChange={(e) => setForm({ ...form, assessment: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" />
                <input placeholder="Plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" />
              </div>
              <p className="text-xs font-medium text-gray-600 pt-1">Vitals</p>
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="BP" value={form.bp} onChange={(e) => setForm({ ...form, bp: e.target.value })} className="h-10 px-2 rounded-lg border text-sm" />
                <input placeholder="Pulse" value={form.pulse} onChange={(e) => setForm({ ...form, pulse: e.target.value })} className="h-10 px-2 rounded-lg border text-sm" />
                <input placeholder="Temp °C" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} className="h-10 px-2 rounded-lg border text-sm" />
                <input placeholder="SpO2 %" value={form.spo2} onChange={(e) => setForm({ ...form, spo2: e.target.value })} className="h-10 px-2 rounded-lg border text-sm" />
                <input placeholder="Weight kg" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className="h-10 px-2 rounded-lg border text-sm" />
                <input placeholder="Height cm" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} className="h-10 px-2 rounded-lg border text-sm" />
              </div>
              {bmi && <p className="text-xs text-gray-500">BMI: {bmi}</p>}
              <p className="text-xs font-medium text-gray-600 pt-1">Prescription (optional)</p>
              <textarea rows={3} placeholder="Medicines (one per line)" value={form.medicines} onChange={(e) => setForm({ ...form, medicines: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" />
              <input placeholder="Advice" value={form.advice} onChange={(e) => setForm({ ...form, advice: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500">Follow-up</label><input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" /></div>
                <div><label className="text-xs text-gray-500">Bill ₹</label><input type="number" min="0" value={form.billAmount} onChange={(e) => setForm({ ...form, billAmount: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" placeholder="0" /></div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" disabled={saving} onClick={() => setShowConsult(false)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-60">{saving ? "Saving…" : "Save Consultation"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white rounded-xl shadow-sm border overflow-hidden"><div className="px-3 py-2 border-b"><h3 className="font-semibold text-sm">{title}</h3></div>{children}</div>;
}
function Empty({ text }: { text: string }) {
  return <div className="p-4 text-center text-gray-400 text-xs">{text}</div>;
}
