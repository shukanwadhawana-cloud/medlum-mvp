"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  getCurrentDoctor,
  getMyPatients,
  getMyAppointments,
  getMyInvoices,
  addPatient,
  Doctor,
  Patient,
} from "@/lib/auth";

export default function DashboardPage() {
  const router = useRouter();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [apptCount, setApptCount] = useState(0);
  const [pendingAmt, setPendingAmt] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", age: "", gender: "Male", phone: "", notes: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    const d = getCurrentDoctor();
    if (!d) { router.replace("/login"); return; }
    setDoctor(d);
    setPatients(getMyPatients());
    setApptCount(getMyAppointments().filter(a => a.status === "Scheduled").length);
    setPendingAmt(getMyInvoices().filter(i => i.status !== "Paid").reduce((s, i) => s + i.amount, 0));
  }, [router]);

  const handleAddPatient = (e: React.FormEvent) => {
    e.preventDefault();
    const result = addPatient({
      name: form.name,
      age: parseInt(form.age) || 0,
      gender: form.gender,
      phone: form.phone,
      notes: form.notes,
    });
    if (result.success) {
      setPatients(getMyPatients());
      setShowAdd(false);
      setForm({ name: "", age: "", gender: "Male", phone: "", notes: "" });
      setMessage("Patient added");
      setTimeout(() => setMessage(""), 2500);
    }
  };

  if (!doctor) {
    return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white">Loading...</div>;
  }

  return (
    <AppShell doctor={doctor}>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h2 className="text-lg font-semibold">Dashboard</h2>
          <p className="text-xs text-gray-500">Welcome, {doctor.name}</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-sm font-medium shrink-0">
          + Patient
        </button>
      </div>

      {message && <div className="mb-3 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">{message}</div>}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl p-3 shadow-sm border">
          <p className="text-xs text-gray-500">Patients</p>
          <p className="text-xl font-bold text-[#c2183a] mt-1">{patients.length}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border">
          <p className="text-xs text-gray-500">Upcoming Appts</p>
          <p className="text-xl font-bold mt-1">{apptCount}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border">
          <p className="text-xs text-gray-500">Pending Bills</p>
          <p className="text-xl font-bold mt-1">₹{pendingAmt}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border">
          <p className="text-xs text-gray-500">Isolation</p>
          <p className="text-sm font-semibold mt-1 text-green-600">Active</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-3 py-2 border-b">
          <h3 className="font-semibold text-sm">My Patients</h3>
        </div>
        {patients.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No patients yet. Tap + Patient.</div>
        ) : (
          <div className="divide-y">
            {patients.map((p) => (
              <div key={p.id} className="px-3 py-2.5">
                <p className="font-medium text-sm">{p.name}</p>
                <p className="text-xs text-gray-500">{p.age} yrs · {p.gender} · {p.phone}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl">
            <h3 className="text-base font-semibold mb-3">Add Patient</h3>
            <form onSubmit={handleAddPatient} className="space-y-2.5">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" required placeholder="Age" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" />
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm">
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <input required placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full h-10 px-3 rounded-lg border text-sm" />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 h-10 rounded-lg border text-sm">Cancel</button>
                <button type="submit" className="flex-1 h-10 rounded-lg bg-[#c2183a] text-white text-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
