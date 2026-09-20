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
  phone: string;
  careSetting?: string;
  registrationNo?: string;
  uhid?: string;
};

/** Dedicated OPD workspace — outpatient only. Clinical detail on /patients/[id]. */
export default function OpdPage() {
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appts, setAppts] = useState<any[]>([]);
  const [encounters, setEncounters] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", age: "", gender: "Male", phone: "" });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [pts, appointments, ens] = await Promise.all([
        apiGetPatients(),
        apiGetAppointments(),
        apiGetEncounters(),
      ]);
      const patientList = Array.isArray(pts) ? pts : (pts as any)?.patients || [];
      setPatients(patientList.filter((p: Patient) => (p.careSetting || "OPD") !== "IPD"));
      setAppts(Array.isArray(appointments) ? appointments : (appointments as any)?.appointments || []);
      setEncounters(Array.isArray(ens) ? ens : (ens as any)?.encounters || []);
    } catch {
      setErr("Could not load OPD data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && doctor) void reload();
  }, [authLoading, doctor, reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.phone?.includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.registrationNo || "").toLowerCase().includes(q) ||
        (p.uhid || "").toLowerCase().includes(q)
    );
  }, [patients, search]);

  const todayAppts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return appts.filter((a) => String(a.date || "").startsWith(today) || a.date === today);
  }, [appts]);

  const recentEncounters = useMemo(
    () =>
      [...encounters]
        .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())
        .slice(0, 8),
    [encounters]
  );

  async function registerPatient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const res = await apiAddPatient({
        name: form.name.trim(),
        age: Number(form.age) || 0,
        gender: form.gender,
        phone: form.phone.trim(),
        careSetting: "OPD",
      } as any);
      if (!res.success) {
        setErr(res.error || "Could not register patient");
        return;
      }
      setMsg(`Registered ${form.name} for OPD`);
      setShowAdd(false);
      setForm({ name: "", age: "", gender: "Male", phone: "" });
      await reload();
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <AppShell>
        <p className="text-sm text-gray-500">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c2183a]">Outpatient</p>
        <h1 className="text-2xl font-bold text-[#140a1f]">OPD</h1>
        <p className="mt-1 text-sm text-gray-500">
          Register and select patients, open a consultation, order labs, and bill from the patient chart.
        </p>
      </div>

      {msg && <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</div>}
      {err && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border bg-white p-3">
          <p className="text-[10px] uppercase text-gray-400">OPD patients</p>
          <p className="text-xl font-bold text-[#140a1f]">{patients.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-3">
          <p className="text-[10px] uppercase text-gray-400">Today&apos;s appts</p>
          <p className="text-xl font-bold text-[#140a1f]">{todayAppts.length}</p>
        </div>
        <Link href="/labs" className="rounded-xl border bg-white p-3 active:bg-gray-50">
          <p className="text-[10px] uppercase text-gray-400">Laboratory</p>
          <p className="text-sm font-semibold text-[#c2183a]">Open labs →</p>
        </Link>
        <Link href="/billing" className="rounded-xl border bg-white p-3 active:bg-gray-50">
          <p className="text-[10px] uppercase text-gray-400">Billing</p>
          <p className="text-sm font-semibold text-[#c2183a]">Invoices →</p>
        </Link>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowAdd((v) => !v)} className="h-11 rounded-xl bg-[#c2183a] px-4 text-sm font-semibold text-white">
          {showAdd ? "Cancel" : "Register OPD patient"}
        </button>
        <Link href="/appointments" className="flex h-11 items-center rounded-xl border px-4 text-sm font-medium">Appointments</Link>
        <Link href="/clinic/tariffs" className="flex h-11 items-center rounded-xl border px-4 text-sm font-medium">Rate list</Link>
      </div>

      {showAdd && (
        <form onSubmit={registerPatient} className="mb-4 space-y-2 rounded-2xl border bg-white p-4">
          <h2 className="font-semibold text-[#140a1f]">New OPD registration</h2>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Patient name *" className="h-11 w-full rounded-xl border px-3 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <input required type="number" min={0} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="Age *" className="h-11 rounded-xl border px-3 text-sm" />
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="h-11 rounded-xl border px-3 text-sm bg-white">
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="h-11 rounded-xl border px-3 text-sm" />
          </div>
          <button disabled={saving} className="h-11 w-full rounded-xl bg-[#140a1f] text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Register patient"}
          </button>
        </form>
      )}

      <div className="mb-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, UHID, MedLum ID…" className="h-11 w-full rounded-xl border bg-white px-3 text-sm" />
      </div>

      <section className="mb-4 overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 font-semibold">OPD patient list</div>
        {loading ? (
          <p className="p-6 text-center text-sm text-gray-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">{search ? "No matching patient." : "No OPD patients yet."}</p>
        ) : (
          <div className="divide-y">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{p.age} yrs · {p.gender}{p.phone ? ` · ${p.phone}` : ""}</p>
                  <p className="mt-1 text-[10px] text-gray-400">ID {p.id}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <Link href={`/patients/${p.id}`} className="flex h-9 items-center justify-center rounded-lg bg-[#c2183a] px-3 text-xs font-semibold text-white">Open OPD visit</Link>
                  <Link href="/billing" className="text-center text-[11px] font-medium text-[#c2183a]">Bill</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-4 overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 font-semibold">Recent OPD encounters</div>
        {recentEncounters.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">No encounters yet. Open a patient chart to record a visit.</p>
        ) : (
          <div className="divide-y">
            {recentEncounters.map((e: any) => (
              <Link key={e.id} href={`/patients/${e.patientId}`} className="block p-3 active:bg-gray-50">
                <p className="text-sm font-medium">{e.patientName || e.patientId}</p>
                <p className="mt-0.5 text-xs text-gray-500">{e.date}{e.chiefComplaint ? ` · ${e.chiefComplaint}` : ""}{e.diagnosis ? ` · Dx: ${e.diagnosis}` : ""}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <p className="pb-6 text-center text-[11px] text-gray-400">
        IPD admissions stay on the <Link href="/ipd" className="text-[#c2183a]">IPD</Link> screen.
      </p>
    </AppShell>
  );
}
