"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatients, apiGetAppointments, apiGetInvoices, apiAddPatient } from "@/lib/api";

type Patient = { id: string; name: string; age: number; gender: string; phone: string; bp?: string; allergies?: string };

export default function DashboardPage() {
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [apptCount, setApptCount] = useState(0);
  const [pendingAmt, setPendingAmt] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", age: "", gender: "Male", phone: "", bp: "", allergies: "", notes: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dataLoading, setDataLoading] = useState(true);

  const reload = useCallback(async () => {
    const [pts, appts, invs] = await Promise.all([apiGetPatients(), apiGetAppointments(), apiGetInvoices()]);
    setPatients(pts as Patient[]);
    setApptCount((appts as any[]).filter((a) => a.status === "Scheduled").length);
    setPendingAmt((invs as any[]).filter((i) => i.status !== "Paid").reduce((s, i) => s + (Number(i.amount) || 0), 0));
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) { router.replace("/login"); return; }
    reload();
  }, [doctor, authLoading, router, reload]);

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const result = await apiAddPatient({
        name: form.name.trim(), age: parseInt(form.age, 10) || 0, gender: form.gender,
        phone: form.phone.trim(), bp: form.bp.trim(), allergies: form.allergies.trim(), notes: form.notes.trim(),
      });
      if (result.success) {
        await reload();
        setShowAdd(false);
        setForm({ name: "", age: "", gender: "Male", phone: "", bp: "", allergies: "", notes: "" });
        setMessage("Patient saved");
        setTimeout(() => setMessage(""), 2500);
      } else setError(result.error || "Could not save patient");
    } catch { setError("Network error — try again"); }
    finally { setSaving(false); }
  };

  if (authLoading || !doctor) {
    return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div><h2 className="text-lg font-semibold">Dashboard</h2><p className="text-xs text-gray-500">Welcome, {doctor.name}</p></div>
        <button type="button" onClick={() => { setError(""); setShowAdd(true); }} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-sm font-medium shrink-0">+ Patient</button>
      </div>
      {message && <div className="mb-3 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">{message}</div>}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl p-3 shadow-sm border"><p className="text-xs text-gray-500">Patients</p><p className="text-xl font-bold text-[#c2183a] mt-1">{dataLoading ? "…" : patients.length}</p></div>
        <div className="bg-white rounded-xl p-3 shadow-sm border"><p className="text-xs text-gray-500">Upcoming Appts</p><p className="text-xl font-bold mt-1">{dataLoading ? "…" : apptCount}</p></div>
        <div className="bg-white rounded-xl p-3 shadow-sm border"><p className="text-xs text-gray-500">Pending Bills</p><p className="text-xl font-bold mt-1">{dataLoading ? "…" : `₹${pendingAmt}`}</p></div>
        <div className="bg-white rounded-xl p-3 shadow-sm border"><p className="text-xs text-gray-500">Data</p><p className="text-sm font-semibold mt-1 text-green-600">PostgreSQL</p></div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-3 py-2 border-b"><h3 className="font-semibold text-sm">My Patients</h3></div>
        {dataLoading ? <div className="p-6 text-center text-gray-400 text-sm">Loading patients…</div>
          : patients.length === 0 ? <div className="p-6 text-center text-gray-500 text-sm">No patients yet. Tap <b>+ Patient</b>.</div>
          : <div className="divide-y">{patients.map((p) => (
            <Link key={p.id} href={`/patients/${p.id}`} className="px-3 py-2.5 block hover:bg-gray-50">
              <p className="font-medium text-sm text-[#1a1a1f]">{p.name}</p>
              <p className="text-xs text-gray-500">{p.age} yrs · {p.gender} · {p.phone}</p>
              {(p.bp || p.allergies) && <p className="text-xs text-gray-500 mt-0.5">{p.bp ? `BP: ${p.bp}` : ""}{p.bp && p.allergies ? " · " : ""}{p.allergies ? `Allergies: ${p.allergies}` : ""}</p>}
            </Link>
          ))}</div>}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-3">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold mb-3">Add Patient</h3>
            {error && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <form onSubmit={handleAddPatient} className="space-y-2.5">
              <input required placeholder="Full name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" required placeholder="Age *" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm" />
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm"><option>Male</option><option>Female</option><option>Other</option></select>
              </div>
              <input required placeholder="Phone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm" />
              <input placeholder="BP" value={form.bp} onChange={(e) => setForm({ ...form, bp: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm" />
              <input placeholder="Allergies" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm" />
              <div className="flex gap-2 pt-1">
                <button type="button" disabled={saving} onClick={() => setShowAdd(false)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-60">{saving ? "Saving…" : "Save Patient"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
