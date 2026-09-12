"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetEncounters, apiGetPatients } from "@/lib/api";

type Patient = { id: string; name: string; age: number; gender: string; phone: string; bp?: string; allergies?: string; careSetting?: "OPD"|"IPD"; address?: string; idType?: string; idNumber?: string; mlcNumber?: string; prdNumber?: string };
type Encounter = { id: string; patientId: string; date: string; chiefComplaint?: string; diagnosis?: string; followUpDate?: string | null };

export default function PatientsPage() {
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const [pts, ens] = await Promise.all([apiGetPatients(), apiGetEncounters()]); setPatients(pts as Patient[]); setEncounters(ens as Encounter[]); setLoading(false); }, []);
  useEffect(() => { if (authLoading) return; if (!doctor) { router.replace("/login"); return; } load(); }, [doctor, authLoading, router, load]);
  const latestByPatient = useMemo(() => { const map = new Map<string, Encounter>(); for (const e of encounters) if (!map.has(e.patientId)) map.set(e.patientId, e); return map; }, [encounters]);
  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); const list = q ? patients.filter(p => p.name.toLowerCase().includes(q) || p.phone.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) : patients; return list.slice(0,50); }, [patients, search]);
  if (authLoading || !doctor) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;
  return <AppShell>
    <div className="flex items-center justify-between gap-2 mb-4"><div><h2 className="text-lg font-semibold">Patients</h2><p className="text-xs text-gray-500">OPD and IPD registration, identity and longitudinal clinical records</p></div><Link href="/ipd" className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-xs font-medium flex items-center">Register / Admit</Link></div>
    <div className="bg-white rounded-xl shadow-sm border p-3 mb-3 sticky top-[60px] z-20"><label htmlFor="patient-search" className="sr-only">Search patients</label><input id="patient-search" autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone or MedLum patient ID" className="w-full h-11 px-3 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#c2183a]/20"/><p className="text-[11px] text-gray-400 mt-2">{search?`${filtered.length} matching patient${filtered.length===1?"":"s"}`:`${patients.length} patient${patients.length===1?"":"s"}`}</p></div>
    <div className="bg-white rounded-xl shadow-sm border p-3 mb-3"><p className="text-sm font-semibold">Registration fields now supported</p><p className="text-[11px] text-gray-500 mt-0.5">Address · government ID type/number · MLC number · PRD/admission number · ward/ICU · room/bed · consultant/specialty · HPI · past medical/surgical history · systemic examination · working diagnosis.</p><Link href="/ipd" className="inline-flex mt-2 px-3 py-1.5 rounded-lg border text-xs font-medium">Open registration & IPD workspace</Link></div>
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">{loading?<div className="p-6 text-center text-gray-400 text-sm">Loading patients…</div>:filtered.length===0?<div className="p-8 text-center text-gray-500 text-sm">{search?"No matching patient.":"No patients yet."}</div>:<div className="divide-y">{filtered.map(p=>{const latest=latestByPatient.get(p.id);return <div key={p.id} className="p-3"><div className="flex items-start justify-between gap-3"><Link href={`/patients/${p.id}`} className="min-w-0 flex-1"><p className="font-semibold text-sm truncate">{p.name}</p><p className="text-xs text-gray-500 mt-0.5">{p.age} yrs · {p.gender} · {p.phone} · {p.careSetting||"OPD"}</p><p className="text-[10px] text-gray-400 mt-1">MedLum ID: {p.id}</p></Link><Link href={`/patients/${p.id}`} className="shrink-0 h-8 px-2.5 rounded-lg bg-[#c2183a] text-white text-xs font-medium flex items-center">Open Patient</Link></div><div className="mt-2 flex flex-wrap gap-1.5">{p.address&&<span className="px-2 py-1 rounded-full bg-gray-50 text-gray-600 text-[10px]">Address recorded</span>}{p.idNumber&&<span className="px-2 py-1 rounded-full bg-gray-50 text-gray-600 text-[10px]">{p.idType||"Government ID"}</span>}{p.mlcNumber&&<span className="px-2 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-medium">MLC {p.mlcNumber}</span>}{p.prdNumber&&<span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px]">PRD {p.prdNumber}</span>}{p.allergies&&<span className="px-2 py-1 rounded-full bg-red-50 text-red-700 text-[11px]">⚠ {p.allergies}</span>}{latest?.diagnosis&&<span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-[11px]">Dx: {latest.diagnosis}</span>}</div>{latest?<div className="mt-2 text-xs text-gray-500"><span>Last visit: {latest.date}</span>{latest.chiefComplaint&&<span> · {latest.chiefComplaint}</span>}{latest.followUpDate&&<span className="text-[#c2183a]"> · Follow-up {latest.followUpDate}</span>}</div>:<p className="mt-2 text-xs text-gray-400">No consultation recorded</p>}<div className="mt-2 flex gap-2"><Link href={`/patients/${p.id}`} className="px-2.5 py-1.5 rounded-lg border text-[11px] font-medium">Review history</Link><Link href={`/patients/${p.id}`} className="px-2.5 py-1.5 rounded-lg bg-[#c2183a] text-white text-[11px] font-medium">New consultation</Link></div></div>})}</div>}</div>
  </AppShell>;
}
