"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatients } from "@/lib/api";

export default function PatientsPage() {
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [showOPD, setShowOPD] = useState(true);
  const [showIPD, setShowIPD] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setPatients(await apiGetPatients()); }
    catch (e: any) { setError(e?.message || "Could not load patients"); setPatients([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!authLoading && doctor) void load(); }, [authLoading, doctor, load]);

  const filtered = useMemo(() => {
    const scoped = patients.filter((p) => {
      const setting = String(p.careSetting || "OPD").toUpperCase();
      return (setting === "OPD" && showOPD) || (setting === "IPD" && showIPD);
    });
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((p) => [p.name, p.phone, p.id, p.uhid, p.registrationNo, p.medlumId, p.careSetting]
      .filter(Boolean).some((x) => String(x).toLowerCase().includes(q)));
  }, [patients, search, showOPD, showIPD]);

  if (authLoading || !doctor) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;

  return <AppShell>
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-lg font-semibold">Patients</h2><p className="text-xs text-gray-500">Shared patient identity · OPD and IPD workflows</p></div>
        <Link href="/patients/new" className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-xs font-medium inline-flex items-center">+ Register patient</Link>
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, UHID, MedLum ID…" className="w-full h-10 rounded-lg border px-3 text-sm" />
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid lg:grid-cols-[150px_1fr] gap-3">
        <aside className="bg-white rounded-xl border shadow-sm p-2 h-fit lg:sticky lg:top-24">
          <p className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Patient view</p>
          <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs cursor-pointer hover:bg-gray-50"><input type="checkbox" checked={showOPD} onChange={(e) => setShowOPD(e.target.checked)} /> OPD</label>
          <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs cursor-pointer hover:bg-gray-50"><input type="checkbox" checked={showIPD} onChange={(e) => setShowIPD(e.target.checked)} /> IPD</label>
          <div className="mt-3 border-t pt-2 px-2 text-[10px] text-gray-400">Patients remains the shared identity layer. OPD and IPD can be shown or hidden independently.</div>
        </aside>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {loading ? <div className="p-6 text-center text-gray-400 text-sm">Loading patients…</div> : filtered.length === 0 ? <div className="p-8 text-center text-gray-500 text-sm">{search ? "No matching patient." : "No patients in the selected view."}</div> :
            <div className="divide-y">{filtered.map((p) => {
              const setting = String(p.careSetting || "OPD").toUpperCase();
              const isIPD = setting === "IPD";
              return <div key={p.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1"><p className="font-semibold text-sm truncate">{p.name}</p><p className="text-xs text-gray-500 mt-0.5">{p.age} yrs · {p.gender} · {p.phone}</p>
                    <div className="mt-1 grid gap-x-4 gap-y-0.5 text-[10px] text-gray-500 sm:grid-cols-2"><span className="font-medium text-gray-600">UHID: {p.uhid || "—"}</span><span className="font-medium text-gray-600">MedLum ID: {p.medlumId || "—"}</span>{isIPD && <span>Admission: {p.admissionDate ? new Date(p.admissionDate).toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"}) : "—"}</span>}{p.registrationNo && <span>Registration: {p.registrationNo}</span>}</div>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-semibold ${isIPD ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"}`}>{isIPD ? "IPD" : "OPD"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">{p.allergies && <span className="px-2 py-1 rounded-full bg-red-50 text-red-700 text-[11px]">⚠ Allergy: {p.allergies}</span>}{p.latestVitals && <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px]">Vitals: BP {p.latestVitals.bp || "—"} · P {p.latestVitals.pulse || "—"} · SpO₂ {p.latestVitals.spo2 || "—"} · RR {p.latestVitals.rr || "—"}</span>}</div>
                <div className="mt-2 flex flex-wrap justify-end gap-2"><Link href={`/patients/${p.id}`} className="h-8 px-3 rounded-lg border text-[11px] font-medium inline-flex items-center">Review history</Link><Link href={`/patients/${p.id}`} className="h-8 px-3 rounded-lg bg-[#c2183a] text-white text-[11px] font-medium inline-flex items-center">New consultation</Link><Link href={isIPD ? `/ipd/${p.id}` : `/patients/${p.id}`} className="h-8 px-3 rounded-lg bg-[#140a1f] text-white text-[11px] font-medium inline-flex items-center">{isIPD ? "Open IPD" : "Open Patient"}</Link></div>
              </div>;
            })}</div>}
        </div>
      </div>
    </div>
  </AppShell>;
}
