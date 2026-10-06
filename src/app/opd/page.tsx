"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatients, apiGetAppointments, apiAddPatient } from "@/lib/api";

/** Minimal safe OPD page restore — full clinical workflow remains via patient chart links. */
export default function OpdPage() {
  const { doctor, loading } = useDoctor();
  const [patients, setPatients] = useState<any[]>([]);
  const [appts, setAppts] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");

  const reload = useCallback(async () => {
    try {
      const [pts, appointments] = await Promise.all([apiGetPatients(), apiGetAppointments()]);
      setPatients(Array.isArray(pts) ? pts : []);
      setAppts(Array.isArray(appointments) ? appointments : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load OPD data");
    }
  }, []);

  useEffect(() => {
    if (!loading && doctor) reload();
  }, [loading, doctor, reload]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return patients.slice(0, 50);
    return patients.filter((p) =>
      [p.name, p.phone, p.uhid, p.id].some((x) => String(x || "").toLowerCase().includes(needle))
    ).slice(0, 50);
  }, [patients, q]);

  if (loading || !doctor) {
    return <AppShell><p className="text-sm text-gray-500">Loading…</p></AppShell>;
  }

  return (
    <AppShell>
      <section className="medlum-dashboard-hero mb-4">
        <div>
          <p className="medlum-eyebrow">OUTPATIENT</p>
          <h1>OPD</h1>
          <p>Register and select patients, open a consultation, order labs, and bill from the patient chart.</p>
        </div>
        <Link href="/patients/new" className="medlum-primary inline-flex items-center justify-center" style={{ textDecoration: "none" }}>
          + Register patient
        </Link>
      </section>
      {msg && <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</div>}
      {err && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
      <div className="mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, UHID"
          className="w-full h-11 px-3 rounded-lg border text-sm"
        />
      </div>
      <section className="bg-white rounded-xl border shadow-sm overflow-hidden mb-4">
        <div className="px-3 py-2 border-b flex justify-between items-center">
          <h3 className="font-semibold text-sm">Today / recent appointments</h3>
          <Link href="/appointments" className="text-xs text-[#c2183a] font-medium">Full schedule</Link>
        </div>
        <div className="divide-y">
          {appts.slice(0, 20).map((a) => (
            <div key={a.id} className="px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{a.patientName || a.patientId}</p>
                <p className="text-xs text-gray-500">{a.date} {a.time} · {a.type} · {a.status}</p>
              </div>
              {a.patientId && (
                <Link href={`/patients/${a.patientId}`} className="text-xs text-[#c2183a] font-medium shrink-0">Open chart</Link>
              )}
            </div>
          ))}
          {appts.length === 0 && <div className="p-5 text-center text-sm text-gray-500">No appointments loaded.</div>}
        </div>
      </section>
      <section className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b"><h3 className="font-semibold text-sm">Patients</h3></div>
        <div className="divide-y">
          {filtered.map((p) => (
            <Link key={p.id} href={`/patients/${p.id}`} className="block px-3 py-2.5 hover:bg-gray-50">
              <p className="font-medium text-sm">{p.name}</p>
              <p className="text-xs text-gray-500">{p.age} yrs · {p.gender} · {p.phone}</p>
            </Link>
          ))}
          {filtered.length === 0 && <div className="p-5 text-center text-sm text-gray-500">No patients match.</div>}
        </div>
      </section>
    </AppShell>
  );
}
