"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGetPatientDetail } from "@/lib/api";

export default function PatientLabelPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  useEffect(() => { if (id) apiGetPatientDetail(id).then(setData).catch(() => setData(null)); }, [id]);
  const p = data?.patient;
  if (!p) return <div className="min-h-screen grid place-items-center text-sm">Loading patient label…</div>;
  return <main className="min-h-screen bg-white p-6 text-black print:p-2">
    <section className="w-full max-w-xl mx-auto border-2 border-black rounded-lg p-5 print:rounded-none">
      <div className="flex items-center justify-between border-b pb-3 mb-4"><div><h1 className="text-xl font-bold">MedLum</h1><p className="text-xs font-semibold uppercase tracking-widest">Patient Identification / BRADMA Label</p></div><span className="text-xs font-bold border border-black rounded px-2 py-1">IPD</span></div>
      <div className="grid grid-cols-2 gap-y-3 text-sm"><div><p className="text-[10px] uppercase text-gray-500">Patient name</p><p className="font-bold text-lg">{p.name}</p></div><div><p className="text-[10px] uppercase text-gray-500">Patient ID</p><p className="font-mono font-bold">{p.id}</p></div><div><p className="text-[10px] uppercase text-gray-500">Age / Sex</p><p>{p.age} yrs / {p.gender}</p></div><div><p className="text-[10px] uppercase text-gray-500">Phone</p><p>{p.phone}</p></div><div className="col-span-2"><p className="text-[10px] uppercase text-gray-500">Allergy</p><p className={p.allergies ? "font-bold" : ""}>{p.allergies || "No allergy recorded"}</p></div></div>
      <p className="mt-5 text-[10px] text-gray-500">Print and affix to the patient's physical file / bedside documentation according to hospital identification policy.</p>
      <button type="button" onClick={() => window.print()} className="mt-4 h-10 px-4 rounded-lg bg-black text-white text-sm print:hidden">Print label</button>
    </section>
  </main>;
}
