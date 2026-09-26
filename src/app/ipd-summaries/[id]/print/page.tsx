"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

export default function IPDDischargePrintPage(){
  const params=useParams<{id:string}>();
  const patientId=String(params?.id||"");
  const [patient,setPatient]=useState<any>(null);
  const [summary,setSummary]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!patientId)return;
    fetch("/api/ipd",{credentials:"include",cache:"no-store"})
      .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Could not load discharge record");return d;})
      .then(d=>{
        const p=[...(d.patients||[]),...(d.ipdHistory||[])].find((x:any)=>x.id===patientId);
        if(!p)throw new Error("Patient record not found");
        const notes=(p.clinicalNotes||[]).filter((n:any)=>String(n.noteType||"")==="Discharge Summary");
        setPatient(p);setSummary(notes.sort((a:any,b:any)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())[0]||null);
      })
      .catch(e=>setError(e.message||"Could not load discharge record"))
      .finally(()=>setLoading(false));
  },[patientId]);

  const lines=useMemo(()=>String(summary?.content||"").split("\n"),[summary]);
  if(loading)return <div className="p-8 text-sm">Loading discharge summary…</div>;
  if(error)return <div className="p-8 text-sm text-red-700">{error}</div>;
  if(!patient||!summary)return <div className="p-8 text-sm">No finalized discharge summary is available for this patient.</div>;

  return <main className="min-h-screen bg-white text-black">
    <div className="print:hidden sticky top-0 border-b bg-white p-3 flex items-center justify-between gap-2">
      <div><p className="font-semibold text-sm">Final Discharge Summary</p><p className="text-[11px] text-gray-500">UHID {patient.uhid||patient.registrationNo||"—"} · {patient.name}</p></div>
      <button onClick={()=>window.print()} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold">Print / Save PDF</button>
    </div>
    <article className="mx-auto max-w-[850px] p-8 print:p-10">
      <header className="border-b pb-4 mb-5">
        <div className="h-10" />
        <h1 className="text-xl font-bold">DISCHARGE SUMMARY</h1>
        <div className="mt-2 grid grid-cols-2 gap-1 text-xs"><div>Patient: <b>{patient.name}</b></div><div>UHID: <b>{patient.uhid||patient.registrationNo||"—"}</b></div><div>Age / Gender: {patient.age} / {patient.gender}</div><div>Phone: {patient.phone||"—"}</div></div>
      </header>
      <pre className="whitespace-pre-wrap font-sans text-xs leading-5">{lines.join("\n")}</pre>
      <footer className="mt-10 border-t pt-4 text-[10px] text-gray-500">Finalized discharge record · MedLum · This document is part of the patient's permanent clinical record.</footer>
    </article>
  </main>;
}
