"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatients, apiGetAppointments, apiGetInvoices, apiGetEncounters, apiAddPatient, apiUpdateAppointmentStatus } from "@/lib/api";

type Patient = { id: string; name: string; age: number; gender: string; phone: string; bp?: string; allergies?: string };
type Appointment = { id: string; patientId: string; patientName: string; date: string; time: string; type: string; status: string };
type Encounter = { id: string; patientId: string; date: string; followUpDate?: string | null };

const today = () => new Date().toISOString().slice(0, 10);

export default function DashboardPage() {
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [pendingAmt, setPendingAmt] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", age: "", gender: "Male", phone: "", bp: "", allergies: "", notes: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dataLoading, setDataLoading] = useState(true);

  const reload = useCallback(async () => {
    const [pts, appointments, invs, ens] = await Promise.all([apiGetPatients(), apiGetAppointments(), apiGetInvoices(), apiGetEncounters()]);
    setPatients(pts as Patient[]);
    setAppts(appointments as Appointment[]);
    setPendingAmt((invs as any[]).filter((i) => i.status !== "Paid").reduce((s, i) => s + (Number(i.amount) || 0), 0));
    setEncounters(ens as Encounter[]);
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) { router.replace("/login"); return; }
    reload();
  }, [doctor, authLoading, router, reload]);

  const todaysAppts = useMemo(() => appts.filter((a) => a.date === today()).sort((a, b) => a.time.localeCompare(b.time)), [appts]);
  const completedToday = todaysAppts.filter((a) => a.status === "Completed").length;
  const waiting = todaysAppts.filter((a) => a.status === "Waiting");
  const upcomingToday = todaysAppts.filter((a) => a.status === "Scheduled");
  const followUps = useMemo(() => {
    const t = today();
    return encounters.filter((e) => e.followUpDate && e.followUpDate >= t).sort((a, b) => String(a.followUpDate).localeCompare(String(b.followUpDate))).slice(0, 8);
  }, [encounters]);
  const overdueFollowUps = useMemo(() => encounters.filter((e) => e.followUpDate && e.followUpDate < today()).length, [encounters]);
  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients.slice(0, 12);
    return patients.filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q)).slice(0, 20);
  }, [patients, search]);

  const setStatus = async (id: string, status: string) => {
    const r = await apiUpdateAppointmentStatus(id, status);
    if (r.success) await reload();
    else setError(r.error || "Could not update appointment");
  };

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setSaving(true);
    try {
      const result = await apiAddPatient({ name: form.name.trim(), age: parseInt(form.age, 10) || 0, gender: form.gender, phone: form.phone.trim(), bp: form.bp.trim(), allergies: form.allergies.trim(), notes: form.notes.trim() });
      if (result.success) { await reload(); setShowAdd(false); setForm({ name: "", age: "", gender: "Male", phone: "", bp: "", allergies: "", notes: "" }); setMessage("Patient saved"); setTimeout(() => setMessage(""), 2500); }
      else setError(result.error || "Could not save patient");
    } catch { setError("Network error — try again"); }
    finally { setSaving(false); }
  };

  if (authLoading || !doctor) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div><h2 className="text-lg font-semibold">Dashboard</h2><p className="text-xs text-gray-500">Welcome, {doctor.name}</p></div>
        <button type="button" onClick={() => { setError(""); setShowAdd(true); }} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-sm font-medium shrink-0">+ Patient</button>
      </div>
      {message && <div className="mb-3 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">{message}</div>}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl p-3 shadow-sm border"><p className="text-xs text-gray-500">Today’s OPD</p><p className="text-xl font-bold text-[#c2183a] mt-1">{dataLoading ? "…" : todaysAppts.length}</p></div>
        <div className="bg-white rounded-xl p-3 shadow-sm border"><p className="text-xs text-gray-500">Completed</p><p className="text-xl font-bold mt-1">{dataLoading ? "…" : completedToday}</p></div>
        <div className="bg-white rounded-xl p-3 shadow-sm border"><p className="text-xs text-gray-500">Waiting</p><p className="text-xl font-bold mt-1">{dataLoading ? "…" : waiting.length}</p></div>
        <div className="bg-white rounded-xl p-3 shadow-sm border"><p className="text-xs text-gray-500">Pending Bills</p><p className="text-xl font-bold mt-1">{dataLoading ? "…" : `₹${pendingAmt}`}</p></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-3">
        <div className="px-3 py-2 border-b flex items-center justify-between"><div><h3 className="font-semibold text-sm">Today’s OPD</h3><p className="text-[11px] text-gray-400">Queue · {upcomingToday.length} scheduled · {waiting.length} waiting</p></div><Link href="/appointments" className="text-xs text-[#c2183a] font-medium">Full schedule</Link></div>
        {dataLoading ? <div className="p-5 text-center text-gray-400 text-sm">Loading queue…</div> : todaysAppts.length === 0 ? <div className="p-5 text-center text-gray-500 text-sm">No appointments today.</div> : <div className="divide-y">{todaysAppts.map((a) => (
          <div key={a.id} className="px-3 py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0"><p className="font-medium text-sm truncate">{a.patientName}</p><p className="text-xs text-gray-500">{a.time} · {a.type} · <span className={a.status === "Waiting" ? "text-amber-600" : a.status === "Completed" ? "text-green-600" : ""}>{a.status}</span></p></div>
            <div className="flex items-center gap-2 shrink-0">
              {a.status === "Scheduled" && <button type="button" onClick={() => setStatus(a.id, "Waiting")} className="text-xs text-amber-700 font-medium">Check in</button>}
              {(a.status === "Scheduled" || a.status === "Waiting") && <Link href={`/patients/${a.patientId}?appointmentId=${a.id}`} className="text-xs text-[#c2183a] font-medium">Start</Link>}
              {a.status === "Completed" && <Link href={`/patients/${a.patientId}`} className="text-xs text-gray-600">View</Link>}
            </div>
          </div>
        ))}</div>}
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-3">
        <div className="px-3 py-2 border-b"><h3 className="font-semibold text-sm">Find Patient</h3></div>
        <div className="p-3"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone" className="w-full h-10 px-3 rounded-lg border text-sm" />
          <div className="mt-2 divide-y">{filteredPatients.map((p) => <Link key={p.id} href={`/patients/${p.id}`} className="block py-2 hover:bg-gray-50"><p className="font-medium text-sm">{p.name}</p><p className="text-xs text-gray-500">{p.age} yrs · {p.gender} · {p.phone}</p></Link>)}{filteredPatients.length === 0 && <p className="py-3 text-center text-xs text-gray-400">No matching patient.</p>}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-3">
        <div className="px-3 py-2 border-b flex justify-between"><h3 className="font-semibold text-sm">Follow-ups</h3><span className="text-[11px] text-gray-400">{overdueFollowUps} overdue</span></div>
        {followUps.length === 0 ? <div className="p-4 text-center text-xs text-gray-400">No upcoming follow-ups.</div> : <div className="divide-y">{followUps.map((e) => { const p = patients.find((x) => x.id === e.patientId); return <Link key={e.id} href={`/patients/${e.patientId}`} className="block px-3 py-2"><p className="text-sm font-medium">{p?.name || "Patient"}</p><p className="text-xs text-gray-500">Follow-up: {e.followUpDate}</p></Link>; })}</div>}
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-3 py-2 border-b"><h3 className="font-semibold text-sm">My Patients</h3></div>
        {dataLoading ? <div className="p-6 text-center text-gray-400 text-sm">Loading patients…</div> : patients.length === 0 ? <div className="p-6 text-center text-gray-500 text-sm">No patients yet. Tap <b>+ Patient</b>.</div> : <div className="divide-y">{patients.map((p) => <Link key={p.id} href={`/patients/${p.id}`} className="px-3 py-2.5 block hover:bg-gray-50"><p className="font-medium text-sm text-[#1a1a1f]">{p.name}</p><p className="text-xs text-gray-500">{p.age} yrs · {p.gender} · {p.phone}</p>{(p.bp || p.allergies) && <p className="text-xs text-gray-500 mt-0.5">{p.bp ? `BP: ${p.bp}` : ""}{p.bp && p.allergies ? " · " : ""}{p.allergies ? `Allergies: ${p.allergies}` : ""}</p>}</Link>)}</div>}
      </div>

      {showAdd && <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-3"><div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl max-h-[90vh] overflow-y-auto"><h3 className="text-base font-semibold mb-3">Add Patient</h3>{error && <div className="mb-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}<form onSubmit={handleAddPatient} className="space-y-2.5"><input required placeholder="Full name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm" /><div className="grid grid-cols-2 gap-2"><input type="number" required placeholder="Age *" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm" /><select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm"><option>Male</option><option>Female</option><option>Other</option></select></div><input required placeholder="Phone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm" /><input placeholder="BP" value={form.bp} onChange={(e) => setForm({ ...form, bp: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm" /><input placeholder="Allergies" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} className="w-full h-11 px-3 rounded-lg border text-sm" /><div className="flex gap-2 pt-1"><button type="button" disabled={saving} onClick={() => setShowAdd(false)} className="flex-1 h-11 rounded-lg border text-sm">Cancel</button><button type="submit" disabled={saving} className="flex-1 h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-60">{saving ? "Saving…" : "Save Patient"}</button></div></form></div></div>}
    </AppShell>
  );
}
