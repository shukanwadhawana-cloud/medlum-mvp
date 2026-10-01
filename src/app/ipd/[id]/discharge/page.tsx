"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

type FormState = {
  diagnosis:string; presentingComplaints:string; courseInHospital:string; procedures:string;
  investigations:string; medicationsDuringStay:string; conditionOnDischarge:string; advice:string;
  followUpAdvice:string; dischargeDateTime:string;
};
const initialForm=():FormState=>({diagnosis:"",presentingComplaints:"",courseInHospital:"",procedures:"",investigations:"",medicationsDuringStay:"",conditionOnDischarge:"",advice:"",followUpAdvice:"",dischargeDateTime:new Date().toISOString().slice(0,16)});

export default function IPDDischargePage(){
 const {id}=useParams<{id:string}>(); const {doctor,loading:authLoading}=useDoctor();
 const [patient,setPatient]=useState<any>(null),[form,setForm]=useState<FormState>(initialForm()),[noteStatus,setNoteStatus]=useState("NONE"),[acknowledged,setAcknowledged]=useState(false),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[msg,setMsg]=useState("");
 const content=()=>[
  `Date and Time of Discharge: ${form.dischargeDateTime}`,`Diagnosis: ${form.diagnosis}`,`Presenting Complaints: ${form.presentingComplaints}`,`Course In Hospital: ${form.courseInHospital}`,
  `Procedures: ${form.procedures}`,`Investigations: ${form.investigations}`,`Medications During Stay: ${form.medicationsDuringStay}`,`Condition on Discharge: ${form.conditionOnDischarge}`,
  `Advice: ${form.advice}`,`Follow Up Advice: ${form.followUpAdvice}`,`Acknowledgement of receipt: ${acknowledged?"Yes":"No"}`
 ].join("\n");
 useEffect(()=>{if(authLoading||!doctor||!id)return;(async()=>{try{
   const r=await fetch("/api/ipd",{credentials:"include",cache:"no-store"}),d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||"Could not load IPD record");
   const p=[...(d.patients||[]),...(d.ipdHistory||[])].find((x:any)=>x.id===id); if(!p)throw new Error("Patient record not found"); setPatient(p);
   setForm(f=>({...f,diagnosis:p.diagnosis||p.workingDiagnosis||"",presentingComplaints:p.chiefComplaint||""}));
   const nr=await fetch(`/api/clinical-notes?patientId=${encodeURIComponent(id)}`,{credentials:"include",cache:"no-store"}),nd=await nr.json().catch(()=>({}));
   if(nr.ok){const note=(nd.notes||[]).find((n:any)=>n.noteType==="Discharge Note"); if(note){setNoteStatus(note.status||"DRAFT"); const values:Record<string,string>={}; for(const line of String(note.content||"").split("\n")){const m=line.match(/^([^:]+):\s?(.*)$/);if(m)values[m[1].trim()]=m[2]||"";} setForm(f=>({...f,dischargeDateTime:values["Date and Time of Discharge"]||f.dischargeDateTime,diagnosis:values["Diagnosis"]||f.diagnosis,presentingComplaints:values["Presenting Complaints"]||f.presentingComplaints,courseInHospital:values["Course In Hospital"]||f.courseInHospital,procedures:values["Procedures"]||f.procedures,investigations:values["Investigations"]||f.investigations,medicationsDuringStay:values["Medications During Stay"]||f.medicationsDuringStay,conditionOnDischarge:values["Condition on Discharge"]||f.conditionOnDischarge,advice:values["Advice"]||f.advice,followUpAdvice:values["Follow Up Advice"]||f.followUpAdvice})); setAcknowledged(values["Acknowledgement of receipt"]==="Yes");}}
 }catch(e:any){setError(e.message||"Could not load discharge record")}finally{setLoading(false)}})()},[authLoading,doctor,id]);
 const set=(key:keyof FormState,value:string)=>setForm(f=>({...f,[key]:value}));
 async function action(name:string){setSaving(true);setError("");setMsg("");try{const r=await fetch("/api/ipd",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:name,patientId:id,content:content()})}),d=await r.json().catch(()=>({}));if(!r.ok||!d.success)throw new Error(d.error||"Discharge action failed");setNoteStatus(d.status||"FINAL");if(name==="discharge-complete"){setPatient((p:any)=>({...p,status:"DISCHARGED"}));setMsg("Discharge finalized. The patient remains searchable and available in history. Billing clearance is separate.");}else if(name==="discharge-summary-draft")setMsg("Discharge summary draft saved and can be reopened.");else setMsg("Discharge summary submitted.");}catch(e:any){setError(e.message||"Discharge action failed")}finally{setSaving(false)}}
 const final=noteStatus==="FINAL"||patient?.status==="DISCHARGED";
 if(authLoading||loading)return <AppShell><div className="p-6 text-sm text-gray-500">Loading discharge workflow…</div></AppShell>;
 if(!doctor)return <AppShell><div className="p-6 text-sm text-gray-500">Sign in to complete discharge.</div></AppShell>;
 return <AppShell><div className="p-4 max-w-4xl mx-auto">
  <div className="flex items-start justify-between gap-3 mb-4"><div><p className="text-[10px] uppercase tracking-wide text-[#c2183a] font-semibold">IPD Discharge</p><h1 className="text-xl font-bold">Discharge Summary</h1><p className="text-xs text-gray-500">{patient?.name} · UHID {patient?.uhid||"—"}</p></div><Link href={`/ipd/${id}/clinical`} className="h-9 px-3 rounded-lg border text-xs inline-flex items-center">Back to workspace</Link></div>
  {error&&<div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}{msg&&<div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</div>}
  <section className="rounded-2xl border bg-white p-4 space-y-3"><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-gray-100 px-2.5 py-1">Summary: <b>{noteStatus}</b></span><span className="rounded-full bg-gray-100 px-2.5 py-1">Clinical status: <b>{patient?.status||"ACTIVE"}</b></span></div>
   <div className="grid md:grid-cols-2 gap-3"><label className="text-xs font-semibold">Discharge date/time<input type="datetime-local" value={form.dischargeDateTime} disabled={final} onChange={e=>set("dischargeDateTime",e.target.value)} className="mt-1 w-full h-9 rounded-lg border px-2 font-normal"/></label><label className="text-xs font-semibold">Diagnosis<input value={form.diagnosis} disabled={final} onChange={e=>set("diagnosis",e.target.value)} className="mt-1 w-full h-9 rounded-lg border px-2 font-normal"/></label></div>
   {([["presentingComplaints","Presenting complaints"],["courseInHospital","Course in hospital"],["procedures","Procedures"],["investigations","Investigations / results"],["medicationsDuringStay","Medications during stay"],["conditionOnDischarge","Condition on discharge"],["advice","Advice"],["followUpAdvice","Follow-up advice"]] as const).map(([k,label])=><label key={k} className="block text-xs font-semibold">{label}<textarea value={form[k]} disabled={final} onChange={e=>set(k,e.target.value)} className="mt-1 w-full min-h-16 rounded-lg border px-2 py-2 font-normal"/></label>)}
   <label className="flex gap-2 items-start border-t pt-3 text-xs"><input type="checkbox" checked={acknowledged} disabled={final} onChange={e=>setAcknowledged(e.target.checked)} className="mt-0.5"/><span>I/We hereby acknowledge receipt of the discharge summary, instructions and follow-up advice.</span></label>
   <div className="flex flex-wrap gap-2 pt-2">{!final&&<button type="button" onClick={()=>action("discharge-summary-draft")} disabled={saving} className="h-10 rounded-xl border px-4 text-xs font-semibold">{saving?"Saving…":"Save Draft"}</button>}
   {!final&&noteStatus!=="NONE"&&<button type="button" onClick={()=>acknowledged?action("discharge-summary-submit"):setError("Please acknowledge receipt before submitting the discharge summary.")} disabled={saving} className="h-10 rounded-xl border border-[#c2183a]/30 px-4 text-xs font-semibold text-[#c2183a]">{saving?"Submitting…":"Submit"}</button>}
   {!final&&(noteStatus==="DRAFT"||noteStatus==="PENDING_VERIFICATION")&&<button type="button" onClick={()=>acknowledged?action("discharge-complete"):setError("Please acknowledge receipt before completing discharge.")} disabled={saving} className="h-10 rounded-xl bg-[#c2183a] px-4 text-xs font-semibold text-white">{saving?"Finalizing…":"Finalize & Discharge Patient"}</button>}
   {final&&<><span className="h-10 rounded-xl bg-gray-100 px-4 inline-flex items-center text-xs font-semibold text-gray-700">DISCHARGED · FINAL</span><Link href={`/ipd-summaries/${id}/print`} target="_blank" className="h-10 rounded-xl border px-4 inline-flex items-center text-xs font-semibold text-[#c2183a]">Print / Save PDF</Link></>}</div>
   <p className="text-[10px] text-gray-500">Clinical discharge removes the admission from active IPD census only. The patient, UHID, clinical history and billing records remain retained; billing clearance is separate.</p>
  </section></div></AppShell>;
}
