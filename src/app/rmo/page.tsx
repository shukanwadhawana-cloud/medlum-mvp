"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

type Indent = { id:string; type:"Medication"|"Investigation"; patientId:string; patientName:string; roomNumber:string; description:string; notes:string; status:string; createdAt:string };

export default function RMOPage(){
  const { doctor, loading } = useDoctor();
  const [indents,setIndents]=useState<Indent[]>([]),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState("");
  const load=useCallback(async()=>{const r=await fetch("/api/rmo/indents",{credentials:"include",cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||"Could not load RMO indents");return}setIndents(d.indents||[])},[]);
  useEffect(()=>{if(!loading&&doctor)load()},[loading,doctor,load]);
  const consume=async(i:Indent)=>{setBusy(i.id);setError("");setMessage("");try{const r=await fetch("/api/rmo/indents",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:i.type,orderId:i.id})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.success)throw new Error(d.error||"Could not consume indent");setMessage(`${i.type} indent for ${i.patientName} consumed by RMO and handed to the downstream workflow.`);await load()}catch(e:any){setError(e.message||"Could not consume indent")}finally{setBusy("")}};
  if(loading||!doctor)return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;
  return <AppShell><div className="mb-4"><h2 className="text-lg font-semibold">RMO Indent Queue</h2><p className="text-xs text-gray-500">Actionable consumer workflow for medication and investigation indents.</p></div>
    {error&&<div className="mb-3 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}{message&&<div className="mb-3 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">{message}</div>}
    <div className="grid md:grid-cols-2 gap-3 mb-4"><div className="rounded-xl border bg-amber-50 p-3"><p className="text-xs text-amber-800">Pending medication indents</p><p className="text-2xl font-semibold text-amber-900">{indents.filter(i=>i.type==="Medication").length}</p></div><div className="rounded-xl border bg-blue-50 p-3"><p className="text-xs text-blue-800">Pending investigation indents</p><p className="text-2xl font-semibold text-blue-900">{indents.filter(i=>i.type==="Investigation").length}</p></div></div>
    <section className="bg-white rounded-xl border shadow-sm overflow-hidden"><div className="px-3 py-3 border-b"><h3 className="font-semibold text-sm">Pending indents</h3><p className="text-[11px] text-gray-500">Consuming an indent records an RMO action and creates/links the downstream clinical work item.</p></div>{indents.length===0?<div className="p-8 text-center text-sm text-gray-500">No pending indents.</div>:<div className="divide-y">{indents.map(i=><div key={`${i.type}-${i.id}`} className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-3"><div><div className="flex gap-2 items-center"><span className={`px-2 py-1 rounded-full text-[10px] font-medium ${i.type==="Medication"?"bg-amber-50 text-amber-800":"bg-blue-50 text-blue-800"}`}>{i.type} Indent</span><span className="text-[10px] text-gray-500">Pending</span></div><p className="font-semibold text-sm mt-1">{i.patientName} · Room {i.roomNumber||"—"}</p><p className="text-xs text-gray-700">{i.description}</p>{i.notes&&<p className="text-[11px] text-gray-500 mt-1">{i.notes}</p>}</div><button onClick={()=>consume(i)} disabled={!!busy} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-medium disabled:opacity-50">{busy===i.id?"Consuming…":"RMO Consume / Accept"}</button></div>)}</div>}</section>
  </AppShell>;
}
