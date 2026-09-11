"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentDoctor, getMyPatients, getMyPrescriptions, addPrescription, Doctor, Patient, Prescription } from "@/lib/auth";

export default function PrescriptionsPage() {
  const router = useRouter();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [list, setList] = useState<Prescription[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ patientId: "", medicines: "", advice: "" });
  const refresh = () => setList(getMyPrescriptions());

  useEffect(() => {
    const d = getCurrentDoctor();
    if (!d) { router.replace("/login"); return; }
    setDoctor(d); setPatients(getMyPatients()); refresh();
  }, [router]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const p = patients.find(x => x.id === form.patientId);
    if (!p) return;
    addPrescription({ patientId: p.id, patientName: p.name, medicines: form.medicines, advice: form.advice });
    refresh(); setShowAdd(false); setForm({ patientId: "", medicines: "", advice: "" });
  };

  if (!doctor) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white">Loading...</div>;

  return (
    <AppShell doctor={doctor}>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div><h2 className="text-lg font-semibold">Prescriptions</h2><p className="text-xs text-gray-500">Digital Rx</p></div>
        <button onClick={() => setShowAdd(true)} disabled={patients.length === 0} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-40">+ Rx</button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {list.length === 0 ? <div className="p-6 text-center text-gray-500 text-sm">No prescriptions yet.</div> : (
          <div className="divide-y">{list.map(r => (
            <div key={r.id} className="px-3 py-2.5">
              <div className="flex justify-between"><p className="font-medium text-sm">{r.patientName}</p><span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</span></div>
              <p className="text-xs text-gray-600 mt-1"><b>Meds:</b> {r.medicines}</p>
              {r.advice && <p className="text-xs text-gray-500"><b>Advice:</b> {r.advice}</p>}
            </div>
          ))}</div>
        )}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl">
            <h3 className="text-base font-semibold mb-3">New Prescription</h3>
            <form onSubmit={handleAdd} className="space-y-2.5">
              <select required value={form.patientId} onChange={e => setForm({...form, patientId: e.target.value})} className="w-full h-10 px-3 rounded-lg border text-sm">
                <option value="">Select patient</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <textarea required rows={3} value={form.medicines} onChange={e => setForm({...form, medicines: e.target.value})} className="w-full px-3 py-2 rounded-lg border text-sm" placeholder="Tab. Paracetamol 500mg 1-0-1 x 3 days" />
              <textarea rows={2} value={form.advice} onChange={e => setForm({...form, advice: e.target.value})} className="w-full px-3 py-2 rounded-lg border text-sm" placeholder="Advice" />
              <div className="flex gap-2"><button type="button" onClick={() => setShowAdd(false)} className="flex-1 h-10 rounded-lg border text-sm">Cancel</button>
              <button type="submit" className="flex-1 h-10 rounded-lg bg-[#c2183a] text-white text-sm">Save</button></div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
