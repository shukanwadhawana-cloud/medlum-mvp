"use client";

import { useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiAddPatient } from "@/lib/api";

export default function NewPatientPage() {
  const { doctor, loading: authLoading } = useDoctor();
  const [form, setForm] = useState({ name: "", age: "", gender: "Male", phone: "", careSetting: "OPD" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setCreated(null);
    setCandidates([]);
    try {
      const res = await apiAddPatient({
        name: form.name.trim(),
        age: Number(form.age) || 0,
        gender: form.gender,
        phone: form.phone.trim(),
        careSetting: form.careSetting,
      }) as { success?: boolean; error?: string; patient?: any; code?: string; candidates?: any[] };
      if (res?.code === "PATIENT_DUPLICATE_POSSIBLE" || (Array.isArray(res?.candidates) && res.candidates.length)) { setCandidates(res.candidates || []); setError(res.error || "Possible existing patient found"); return; }
      if (!res.success || !res.patient) throw new Error(res.error || "Patient registration failed");
      setCreated(res.patient);
      setForm({ name: "", age: "", gender: "Male", phone: "", careSetting: "OPD" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Patient registration failed");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <AppShell><p className="text-sm text-gray-500">Loading…</p></AppShell>;
  if (!doctor) return <AppShell><p className="text-sm text-red-600">Please sign in again.</p></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-4">
        <div>
          <Link href="/patients" className="text-xs text-[#c2183a]">← Patients</Link>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c2183a]">Patient registration</p>
          <h1 className="text-2xl font-bold text-[#140a1f]">Register new patient</h1>
          <p className="mt-1 text-sm text-gray-500">This creates the patient record and generates the MedLum registration identifiers. OPD/IPD admission or appointment remains a separate workflow.</p>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {candidates.length > 0 && (<section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3"><p className="font-semibold text-amber-900">Possible existing patients in this facility</p><p className="text-sm text-amber-800">No new record was created. Open an existing patient instead of registering a duplicate. Shared family phones are not auto-merged.</p><div className="space-y-2">{candidates.map((c) => (<div key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-white border p-3"><div className="min-w-0"><p className="font-medium truncate">{c.name}</p><p className="text-xs text-gray-500">{c.uhid || c.registrationNo || c.id} · {c.phone} · {c.status}</p></div><Link href={"/patients/" + c.id} className="shrink-0 rounded-lg border px-3 py-2 text-sm font-medium">Open</Link></div>))}</div></section>)}

        {candidates.length > 0 && (<section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3"><p className="font-semibold text-amber-900">Possible existing patients in this facility</p><p className="text-sm text-amber-800">No new record was created. Open an existing patient instead of registering a duplicate. Shared family phones are not auto-merged.</p><div className="space-y-2">{candidates.map((c) => (<div key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-white border p-3"><div className="min-w-0"><p className="font-medium truncate">{c.name}</p><p className="text-xs text-gray-500">{c.uhid || c.registrationNo || c.id} · {c.phone} · {c.status}</p></div><Link href={c.careSetting === "IPD" ? `/ipd/${c.id}` : `/patients/${c.id}`} className="shrink-0 rounded-lg border px-3 py-2 text-sm font-medium">Open</Link></div>))}</div></section>)}
        {created ? (
          <section className="rounded-2xl border border-green-200 bg-green-50 p-4 space-y-3">
            <p className="font-semibold text-green-900">Patient registered successfully</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-white border p-3"><p className="text-[10px] uppercase text-gray-400">Registration No.</p><p className="font-mono font-semibold">{created.registrationNo || "—"}</p></div>
              <div className="rounded-lg bg-white border p-3"><p className="text-[10px] uppercase text-gray-400">UHID</p><p className="font-mono font-semibold">{created.uhid || "—"}</p></div>
              <div className="rounded-lg bg-white border p-3 sm:col-span-2"><p className="text-[10px] uppercase text-gray-400">MedLum ID</p><p className="font-mono font-semibold">{created.medlumId || created.id}</p></div>
            </div>
            <div className="flex gap-2">
              <Link href={created.careSetting === "IPD" ? `/ipd/${created.id}` : `/patients/${created.id}`} className="flex-1 h-10 rounded-lg bg-[#c2183a] text-white inline-flex items-center justify-center text-sm font-semibold">Open patient</Link>
              <button type="button" onClick={() => setCreated(null)} className="flex-1 h-10 rounded-lg border bg-white text-sm font-medium">Register another</button>
            </div>
          </section>
        ) : (
          <form onSubmit={submit} className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Patient name *</label>
              <input required autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-11 w-full rounded-xl border px-3 text-sm" placeholder="Full name" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-xs font-medium mb-1">Age *</label><input required type="number" min={0} max={130} value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} className="h-11 w-full rounded-xl border px-3 text-sm" placeholder="Age" /></div>
              <div><label className="block text-xs font-medium mb-1">Gender</label><select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} className="h-11 w-full rounded-xl border px-3 text-sm bg-white"><option>Male</option><option>Female</option><option>Other</option></select></div>
            </div>
            <div><label className="block text-xs font-medium mb-1">Phone *</label><input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-11 w-full rounded-xl border px-3 text-sm" placeholder="Phone number" inputMode="tel" /></div>
            <div>
              <label className="block text-xs font-medium mb-1">Initial care setting</label>
              <div className="grid grid-cols-2 gap-2">
                {["OPD", "IPD"].map(setting => <button key={setting} type="button" onClick={() => setForm({ ...form, careSetting: setting })} className={`h-10 rounded-lg border text-sm font-medium ${form.careSetting === setting ? "bg-[#140a1f] text-white" : "bg-white"}`}>{setting}</button>)}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">Selecting IPD here marks the patient's initial setting; the actual admission workflow remains in IPD.</p>
            </div>
            <div className="flex gap-2 pt-1">
              <Link href="/patients" className="flex-1 h-11 rounded-xl border inline-flex items-center justify-center text-sm font-medium">Cancel</Link>
              <button disabled={saving} className="flex-1 h-11 rounded-xl bg-[#c2183a] text-white text-sm font-semibold disabled:opacity-50">{saving ? "Registering…" : "Register patient"}</button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
