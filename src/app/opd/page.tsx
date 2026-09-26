"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatients, apiGetAppointments, apiGetEncounters, apiAddPatient } from "@/lib/api";

type Patient = {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone?: string;
  careSetting?: string;
  registrationNo?: string;
  uhid?: string;
  medlumId?: string;
  status?: string;
  deletedAt?: string | null;
};

type Encounter = { patientId?: string; careSetting?: string };

export default function OpdPage() {
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [search, setSearch] = useState("");
  const [deepName, setDeepName] = useState("");
  const [deepPhone, setDeepPhone] = useState("");
  const [deepId, setDeepId] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", age: "", gender: "Male", phone: "" });

  const reload = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [pts, appts, ens] = await Promise.all([apiGetPatients(), apiGetAppointments(), apiGetEncounters()]);
      const list = Array.isArray(pts) ? pts : (pts as any)?.patients || [];
      const encounterList = Array.isArray(ens) ? ens : (ens as any)?.encounters || [];
      setPatients(list.filter((p: Patient) =>
        String(p.careSetting || "OPD").toUpperCase() !== "IPD" &&
        !p.deletedAt &&
        String(p.status || "ACTIVE").toUpperCase() !== "INACTIVE"
      ));
      setAppointments(Array.isArray(appts) ? appts : (appts as any)?.appointments || []);
      setEncounters(encounterList);
    } catch {
      setErr("Could not load OPD data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && doctor) void reload();
  }, [authLoading, doctor, reload]);

  const encounteredIds = useMemo(() => new Set(
    encounters
      .filter((e) => String(e.careSetting || "OPD").toUpperCase() !== "IPD" && e.patientId)
      .map((e) => String(e.patientId))
  ), [encounters]);

  const unencountered = useMemo(
    () => patients.filter((p) => !encounteredIds.has(String(p.id))),
    [patients, encounteredIds]
  );

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const source = showAll ? patients : unencountered;
    if (!q) return source;
    return source.filter((p) =>
      [p.name, p.phone, p.id, p.uhid, p.registrationNo, p.medlumId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [patients, unencountered, showAll, q]);

  const deepResults = useMemo(() => {
    const name = deepName.trim().toLowerCase();
    const phone = deepPhone.replace(/\D/g, "");
    const id = deepId.trim().toLowerCase();
    if (!name && !phone && !id) return [];
    return patients.filter((p) => {
      if (name && !String(p.name || "").toLowerCase().includes(name)) return false;
      if (phone && !String(p.phone || "").replace(/\D/g, "").includes(phone)) return false;
      if (id && ![p.id, p.uhid, p.registrationNo, p.medlumId].filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(id))) return false;
      return true;
    });
  }, [patients, deepName, deepPhone, deepId]);

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return appointments.filter((a) => String(a.date || "").startsWith(today) || a.date === today).length;
  }, [appointments]);

  async function registerPatient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(""); setMsg("");
    try {
      const res = await apiAddPatient({
        name: form.name.trim(), age: Number(form.age) || 0, gender: form.gender,
        phone: form.phone.trim(), careSetting: "OPD",
      });
      if (!res.success) { setErr(res.error || "Could not register patient"); return; }
      setMsg(`Registered ${form.name} for OPD`);
      setShowAdd(false); setForm({ name: "", age: "", gender: "Male", phone: "" });
      await reload();
    } finally { setSaving(false); }
  }

  if (authLoading) return <AppShell><p className="text-sm text-gray-500">Loading…</p></AppShell>;

  return (
    <AppShell>
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c2183a]">Outpatient</p>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-[#140a1f]">OPD Workspace</h1>
            <p className="mt-1 text-sm text-gray-500">Registration, appointments, rate list and direct patient lookup.</p>
          </div>
          <Link href="/patients" className="h-9 inline-flex items-center rounded-lg border px-3 text-xs font-medium">Full Patient Search →</Link>
        </div>
      </div>

      {msg && <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</div>}
      {err && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border bg-white p-3"><p className="text-[10px] uppercase text-gray-400">Awaiting OPD visit</p><p className="text-xl font-bold">{unencountered.length}</p></div>
        <div className="rounded-xl border bg-white p-3"><p className="text-[10px] uppercase text-gray-400">Today’s appointments</p><p className="text-xl font-bold">{todayCount}</p></div>
        <Link href="/appointments" className="rounded-xl border bg-white p-3"><p className="text-[10px] uppercase text-gray-400">Appointments</p><p className="text-sm font-semibold text-[#c2183a]">Open schedule →</p></Link>
        <Link href="/clinic/tariffs" className="rounded-xl border bg-white p-3"><p className="text-[10px] uppercase text-gray-400">Rate list</p><p className="text-sm font-semibold text-[#c2183a]">Open tariffs →</p></Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowAdd((v) => !v)} className="h-11 rounded-xl bg-[#c2183a] px-4 text-sm font-semibold text-white">{showAdd ? "Cancel" : "Register OPD patient"}</button>
        <Link href="/appointments" className="flex h-11 items-center rounded-xl border px-4 text-sm font-medium">Appointments</Link>
        <Link href="/clinic/tariffs" className="flex h-11 items-center rounded-xl border px-4 text-sm font-medium">Rate list</Link>
      </div>

      {showAdd && (
        <form onSubmit={registerPatient} className="mb-4 space-y-2 rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">New OPD registration</h2>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Patient name *" className="h-11 w-full rounded-xl border px-3 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <input required type="number" min={0} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="Age *" className="h-11 rounded-xl border px-3 text-sm" />
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="h-11 rounded-xl border bg-white px-3 text-sm"><option>Male</option><option>Female</option><option>Other</option></select>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="h-11 rounded-xl border px-3 text-sm" />
          </div>
          <button disabled={saving} className="h-11 w-full rounded-xl bg-[#140a1f] text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Register patient"}</button>
        </form>
      )}

      <section className="mb-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b bg-[#f6f4f8] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Find OPD patient</h2>
              <p className="text-[11px] text-gray-500">Encountered patients are not placed on the default worklist; use direct search when you need an existing patient.</p>
            </div>
            <button type="button" onClick={() => setShowAll((v) => !v)} className="h-8 rounded-lg border bg-white px-3 text-[11px] font-semibold">
              {showAll ? "Show unencountered only" : "Show all OPD patients"}
            </button>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Quick search: name, UHID, phone, registration no. or MedLum ID…" className="mt-3 h-11 w-full rounded-xl border bg-white px-3 text-sm" />
        </div>

        <div className="border-b px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Deep patient search</p>
          <p className="mt-0.5 text-[11px] text-gray-500">Search an existing patient directly by name, phone, UHID, registration number or MedLum ID.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input value={deepName} onChange={(e) => setDeepName(e.target.value)} placeholder="Patient name" className="h-10 rounded-lg border px-3 text-sm" />
            <input value={deepPhone} onChange={(e) => setDeepPhone(e.target.value)} placeholder="Phone number" className="h-10 rounded-lg border px-3 text-sm" />
            <input value={deepId} onChange={(e) => setDeepId(e.target.value)} placeholder="UHID / Registration / MedLum ID" className="h-10 rounded-lg border px-3 text-sm" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-white text-[10px] uppercase tracking-wide text-gray-500 border-b">
              <tr>
                <th className="px-3 py-2">S.No</th><th className="px-3 py-2">UHID / ID</th><th className="px-3 py-2">Patient</th>
                <th className="px-3 py-2">Age / Gender</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Registration No.</th>
                <th className="px-3 py-2">Status</th><th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Loading…</td></tr> :
               deepResults.length > 0 ? deepResults.map((p, i) => <PatientRow key={`deep-${p.id}`} patient={p} index={i} encountered={encounteredIds.has(String(p.id))} />) :
               filtered.length === 0 ? <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500">{deepName || deepPhone || deepId ? "No patient matched the deep-search criteria." : q ? "No matching OPD patient." : showAll ? "No OPD patients found." : "No unencountered OPD registrations."}</td></tr> :
               filtered.map((p, i) => <PatientRow key={p.id} patient={p} index={i} encountered={encounteredIds.has(String(p.id))} />)}
            </tbody>
          </table>
          <div className="border-t px-3 py-2 text-[10px] text-gray-400">
            {deepResults.length ? `Deep search: ${deepResults.length} match${deepResults.length === 1 ? "" : "es"}` : `Showing ${filtered.length} ${showAll ? "OPD" : "unencountered"} registration${filtered.length === 1 ? "" : "s"}`}
          </div>
        </div>
      </section>

      <p className="pb-6 text-center text-[11px] text-gray-400">IPD admissions remain on the <Link href="/ipd" className="text-[#c2183a]">IPD</Link> census. OPD clinical detail opens from the patient workspace after selection.</p>
    </AppShell>
  );
}

function PatientRow({ patient, index, encountered }: { patient: Patient; index: number; encountered: boolean }) {
  const identifier = patient.uhid || patient.registrationNo || patient.medlumId || patient.id.slice(0, 8);
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-3 text-gray-500">{index + 1}</td>
      <td className="px-3 py-3 font-mono text-[11px]">{identifier}</td>
      <td className="px-3 py-3"><div className="font-semibold text-sm">{patient.name}</div>{patient.medlumId && patient.medlumId !== identifier && <div className="text-[10px] text-gray-400">MedLum ID: {patient.medlumId}</div>}</td>
      <td className="px-3 py-3">{patient.age} / {patient.gender}</td>
      <td className="px-3 py-3">{patient.phone || "—"}</td>
      <td className="px-3 py-3">{patient.registrationNo || "—"}</td>
      <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${encountered ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{encountered ? "Encountered" : "Awaiting visit"}</span></td>
      <td className="px-3 py-3"><Link href={`/patients/${patient.id}`} className="inline-flex h-8 items-center rounded-lg bg-[#c2183a] px-3 text-xs font-semibold text-white">Open OPD</Link></td>
    </tr>
  );
}
