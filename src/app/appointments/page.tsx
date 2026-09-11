"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  apiMe,
  apiGetPatients,
  apiGetAppointments,
  apiAddAppointment,
  apiUpdateAppointmentStatus,
  ApiDoctor,
} from "@/lib/api";

type Patient = { id: string; name: string };
type Appointment = {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  type: string;
  status: string;
};

export default function AppointmentsPage() {
  const router = useRouter();
  const [doctor, setDoctor] = useState<ApiDoctor | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ patientId: "", date: "", time: "10:00", type: "Consultation" });
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setAppts((await apiGetAppointments()) as Appointment[]);
  };

  useEffect(() => {
    (async () => {
      const me = await apiMe();
      if (!me.success || !me.doctor) {
        router.replace("/login");
        return;
      }
      setDoctor(me.doctor);
      setPatients((await apiGetPatients()) as Patient[]);
      await refresh();
      setLoading(false);
    })();
  }, [router]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = patients.find((x) => x.id === form.patientId);
    if (!p) return;
    const r = await apiAddAppointment({
      patientId: p.id,
      patientName: p.name,
      date: form.date,
      time: form.time,
      type: form.type,
    });
    if (r.success) {
      await refresh();
      setShowAdd(false);
      setForm({ patientId: "", date: "", time: "10:00", type: "Consultation" });
    }
  };

  if (loading || !doctor) {
    return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white">Loading...</div>;
  }

  return (
    <AppShell doctor={doctor}>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h2 className="text-lg font-semibold">Appointments</h2>
          <p className="text-xs text-gray-500">OPD schedule</p>
        </div>
        <button onClick={() => setShowAdd(true)} disabled={patients.length === 0} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-40">
          + Book
        </button>
      </div>
      {patients.length === 0 && (
        <div className="mb-3 bg-amber-50 text-amber-800 text-xs px-3 py-2 rounded-lg">Add a patient on Home first.</div>
      )}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {appts.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No appointments yet.</div>
        ) : (
          <div className="divide-y">
            {appts.map((a) => (
              <div key={a.id} className="px-3 py-2.5 flex justify-between gap-2 items-start">
                <div>
                  <p className="font-medium text-sm">{a.patientName}</p>
                  <p className="text-xs text-gray-500">{a.date} · {a.time} · {a.type}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs">{a.status}</span>
                  {a.status === "Scheduled" && (
                    <div className="flex gap-2 mt-1">
                      <button onClick={async () => { await apiUpdateAppointmentStatus(a.id, "Completed"); await refresh(); }} className="text-xs text-green-600">Done</button>
                      <button onClick={async () => { await apiUpdateAppointmentStatus(a.id, "Cancelled"); await refresh(); }} className="text-xs text-red-600">Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl">
            <h3 className="text-base font-semibold mb-3">Book Appointment</h3>
            <form onSubmit={handleAdd} className="space-y-2.5">
              <select required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm">
                <option value="">Select patient</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" />
                <input type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" />
              </div>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm">
                <option>Consultation</option><option>Follow-up</option><option>Lab Review</option>
              </select>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 h-10 rounded-lg border text-sm">Cancel</button>
                <button type="submit" className="flex-1 h-10 rounded-lg bg-[#c2183a] text-white text-sm">Book</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
