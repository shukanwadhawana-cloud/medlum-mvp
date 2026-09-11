"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetEncounters, apiGetPatients } from "@/lib/api";

type Patient = { id: string; name: string; age: number; gender: string; phone: string; bp?: string; allergies?: string };
type Encounter = { id: string; patientId: string; date: string; chiefComplaint?: string; diagnosis?: string; followUpDate?: string | null };

export default function PatientsPage() {
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [pts, ens] = await Promise.all([apiGetPatients(), apiGetEncounters()]);
    setPatients(pts as Patient[]);
    setEncounters(ens as Encounter[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) { router.replace("/login"); return; }
    load();
  }, [doctor, authLoading, router, load]);

  const latestByPatient = useMemo(() => {
    const map = new Map<string, Encounter>();
    for (const e of encounters) if (!map.has(e.patientId)) map.set(e.patientId, e);
    return map;
  }, [encounters]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? patients.filter((p) => p.name.toLowerCase().includes(q) || p.phone.toLowerCase().includes(q)) : patients;
    return list.slice(0, 50);
  }, [patients, search]);

  if (authLoading || !doctor) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;

  return (
    <AppShell>
      <div className="mb-4"><h2 className="text-lg font-semibold">Patients</h2><p className="text-xs text-gray-500">Search and open the patient record</p></div>
      <div className="bg-white rounded-xl shadow-sm border p-3 mb-3 sticky top-[60px] z-20">
        <label htmlFor="patient-search" className="sr-only">Search patients</label>
        <input id="patient-search" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by patient name or phone" className="w-full h-11 px-3 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#c2183a]/20" />
        <p className="text-[11px] text-gray-400 mt-2">{search ? `${filtered.length} matching patient${filtered.length === 1 ? "" : "s"}` : `${patients.length} patient${patients.length === 1 ? "" : "s"}`}</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? <div className="p-6 text-center text-gray-400 text-sm">Loading patients…</div> : filtered.length === 0 ? <div className="p-8 text-center text-gray-500 text-sm">{search ? "No matching patient." : "No patients yet."}</div> : (
          <div className="divide-y">{filtered.map((p) => {
            const latest = latestByPatient.get(p.id);
            return <div key={p.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/patients/${p.id}`} className="min-w-0 flex-1"><p className="font-semibold text-sm truncate">{p.name}</p><p className="text-xs text-gray-500 mt-0.5">{p.age} yrs · {p.gender} · {p.phone}</p></Link>
                <Link href={`/patients/${p.id}`} className="shrink-0 h-8 px-2.5 rounded-lg bg-[#c2183a] text-white text-xs font-medium flex items-center">Open Patient</Link>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.allergies ? <span className="px-2 py-1 rounded-full bg-red-50 text-red-700 text-[11px]">⚠ {p.allergies}</span> : null}
                {p.bp ? <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px]">BP {p.bp}</span> : null}
                {latest?.diagnosis ? <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-[11px]">Dx: {latest.diagnosis}</span> : null}
              </div>
              {latest ? <div className="mt-2 text-xs text-gray-500"><span>Last visit: {latest.date}</span>{latest.chiefComplaint ? <span> · {latest.chiefComplaint}</span> : null}{latest.followUpDate ? <span className="text-[#c2183a]"> · Follow-up {latest.followUpDate}</span> : null}</div> : <p className="mt-2 text-xs text-gray-400">No consultation recorded</p>}
            </div>;
          })}</div>
        )}
      </div>
    </AppShell>
  );
}
