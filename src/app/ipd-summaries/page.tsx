"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

const TYPES=["Transfer Summary","Discharge Summary","Death Summary","Case Summary","DAMA Summary","LAMA Summary"];
const blank={dateTime:"",diagnosis:"",hpi:"",allergy:"",examTime:"",bp:"",pulse:"",rr:"",spo2:"",temperature:"",cns:"",cvs:"",rs:"",perAbdomen:"",assessment:"",workingDiagnosis:"",treatmentGiven:"",course:"",procedures:"",investigations:"",dischargeTreatment:"",followUpDate:"",followUpConsultant:""};
function F({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="block text-xs font-medium">{label}<input value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full h-9 px-2 rounded-lg border text-xs"/></label>}
function A({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="block text-xs font-medium">{label}<textarea value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full min-h-20 px-2 py-2 rounded-lg border text-xs"/></label>}
const makeContent=(s:any,t:string)=>`[${t}]\nDate & time: ${s.dateTime}\nDiagnosis: ${s.diagnosis}\nHistory of present illness: ${s.hpi}\nAllergy: ${s.allergy}\nExamination time: ${s.examTime}\nVitals: BP ${s.bp} | Pulse ${s.pulse} | RR ${s.rr} | SpO₂ ${s.spo2} | Temperature ${s.temperature}\nAssessment — CNS: ${s.cns}\nAssessment — CVS: ${s.cvs}\nAssessment — Respiratory system: ${s.rs}\nAssessment — Per abdomen: ${s.perAbdomen}\nAssessment / findings: ${s.assessment}\nWorking diagnosis: ${s.workingDiagnosis}\nTreatment given: ${s.treatmentGiven}\nCourse during hospital admission: ${s.course}\nProcedures performed: ${s.procedures}\nInvestigations advised / results: ${s.investigations}\nTreatment on discharge: ${s.dischargeTreatment}\nFollow-up date/time: ${s.followUpDate}\nFollow-up consultant: ${s.followUpConsultant}`;

export default function IPDSummaries(){
 const{doctor}=useDoctor();
 const[patients,setPatients]=useState<any[]>([]),[selected,setSelected]=useState<any>(null),[type,setType]=useState(TYPES[0]),[s,setS]=useState({...blank,dateTime:new Date().toISOString().slice(0,16)}),[msg,setMsg]=useState(""),[error,setError]=useState(""),[saving,setSaving]=useState(false),[discharging,setDischarging]=useState(false),[finalized,setFinalized]=useState(false);
 const load=useCallback(async()=>{
   const r=await fetch("/api/ipd",{credentials:"include",cache:"no-store"});
   if(!r.ok)return;
   const d=await r.json();
   const nextPatients=d.patients||[];
   setPatients(nextPatients);
   if(selected?.id){
     const fresh=nextPatients.find((p:any)=>p.id===selected.id);
     if(fresh)setSelected(fresh);
   }
 },[selected?.id]);
 useEffect(()=>{load()},[load]);
 const save=async(e:React.FormEvent)=>{
   e.preventDefault();if(!selected||finalized)return;
   setSaving(true);setError("");setMsg("");
   try{
     const content=makeContent(s,type);
     const r=await fetch("/api/ipd",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"clinical-note",patientId:selected.id,noteType:type,content,authorRole:`${doctor?.name||"Clinician"} · ${type}`} )});
     const d=await r.json().catch(()=>({}));
     if(!r.ok||!d.success)throw new Error(d.error||"Could not save summary");
     setMsg(`${type} saved as a draft in the IPD documentation timeline`);
     await load();
     setS({...blank,dateTime:new Date().toISOString().slice(0,16)});
   }catch(err:any){setError(err.message||"Save failed")}finally{setSaving(false)}
 };
 const discharge=async()=>{
   if(!selected||type!=="Discharge Summary"||discharging||finalized)return;
   const confirmed=window.confirm(`Finalize the Discharge Summary and discharge ${selected.name} from IPD? This removes the patient from the active IPD census but keeps the UHID and complete clinical record.`);
   if(!confirmed)return;
   setDischarging(true);setError("");setMsg("");
   try{
     // Final discharge requires the summary to be saved first.
     const content=makeContent(s,"Discharge Summary");
     const saveR=await fetch("/api/ipd",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"clinical-note",patientId:selected.id,noteType:"Discharge Summary",content,authorRole:`${doctor?.name||"Clinician"} · Discharge Summary`})});
     const saveD=await saveR.json().catch(()=>({}));
     if(!saveR.ok||!saveD.success)throw new Error(saveD.error||"Could not save final discharge summary");
     const r=await fetch("/api/patients/lifecycle",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({patientId:selected.id,action:"discharge",reason:"Final Discharge Summary completed"})});
     const d=await r.json().catch(()=>({}));
     if(!r.ok||!d.success)throw new Error(d.error||"Could not discharge patient");
     setFinalized(true);
     setMsg(`${selected.name} discharged successfully. The final summary is preserved under UHID and is ready to print.`);
   }catch(err:any){setError(err.message||"Discharge failed")}finally{setDischarging(false)}
 };
 if(!doctor)return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;
 return <AppShell><div className="p-4"><div className="flex items-center justify-between mb-4"><div><h2 className="text-lg font-semibold">Hospital Summaries</h2><p className="text-xs text-gray-500">Draft → Finalize → Discharge → Print · the UHID record is retained</p></div><Link href="/ipd" className="text-xs text-[#c2183a] font-medium">← Back to IPD</Link></div>{error&&<div className="mb-3 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}{msg&&<div className="mb-3 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">{msg}</div>}
 <div className="grid lg:grid-cols-[1fr_2fr] gap-3"><section className="bg-white rounded-xl border shadow-sm overflow-hidden"><div className="px-3 py-3 border-b"><h3 className="font-semibold text-sm">Select IPD patient</h3></div><div className="divide-y max-h-[70vh] overflow-auto">{patients.length===0?<div className="p-6 text-center text-gray-500 text-sm">No active IPD patients.</div>:patients.map(p=><button key={p.id} onClick={()=>{setSelected(p);setFinalized(false)}} className={`w-full text-left px-3 py-3 hover:bg-gray-50 ${selected?.id===p.id?"bg-gray-50":""}`}><p className="font-semibold text-sm">{p.name}</p><p className="text-[11px] text-gray-500">Room {p.roomNumber||"—"} · {p.workingDiagnosis||"No working dx"}</p></button>)}</div></section>
 <section className="bg-white rounded-xl border shadow-sm p-4">{!selected?<div className="p-8 text-center text-sm text-gray-500">Select a patient to complete a hospital summary.</div>:<form onSubmit={save}><div className="flex items-center gap-2 mb-3"><h3 className="font-semibold text-sm">{selected.name}</h3><select value={type} disabled={finalized} onChange={e=>setType(e.target.value)} className="h-9 px-2 rounded-lg border text-xs ml-auto">{TYPES.map(t=><option key={t}>{t}</option>)}</select></div><div className="grid md:grid-cols-3 gap-2"><F label="1. Date & time" value={s.dateTime} onChange={v=>setS({...s,dateTime:v})}/><F label="2. Diagnosis" value={s.diagnosis} onChange={v=>setS({...s,diagnosis:v})}/><F label="4. Allergy" value={s.allergy||selected.allergies||""} onChange={v=>setS({...s,allergy:v})}/><A label="3. History of present illness" value={s.hpi} onChange={v=>setS({...s,hpi:v})}/><F label="5. Examination time" value={s.examTime} onChange={v=>setS({...s,examTime:v})}/><div className="border rounded-lg p-2"><p className="text-xs font-semibold mb-2">6. Vitals during examination</p><div className="grid grid-cols-2 gap-2"><F label="BP" value={s.bp} onChange={v=>setS({...s,bp:v})}/><F label="Pulse" value={s.pulse} onChange={v=>setS({...s,pulse:v})}/><F label="RR" value={s.rr} onChange={v=>setS({...s,rr:v})}/><F label="SpO₂" value={s.spo2} onChange={v=>setS({...s,spo2:v})}/><F label="Temperature" value={s.temperature} onChange={v=>setS({...s,temperature:v})}/></div></div><A label="7. Assessment — CNS" value={s.cns} onChange={v=>setS({...s,cns:v})}/><A label="7. Assessment — CVS" value={s.cvs} onChange={v=>setS({...s,cvs:v})}/><A label="7. Assessment — Respiratory system" value={s.rs} onChange={v=>setS({...s,rs:v})}/><A label="7. Assessment — Per abdomen" value={s.perAbdomen} onChange={v=>setS({...s,perAbdomen:v})}/><A label="8. Assessment / findings" value={s.assessment} onChange={v=>setS({...s,assessment:v})}/><A label="9. Working diagnosis" value={s.workingDiagnosis} onChange={v=>setS({...s,workingDiagnosis:v})}/><A label="10. Treatment given" value={s.treatmentGiven} onChange={v=>setS({...s,treatmentGiven:v})}/><A label="11. Course during hospital admission" value={s.course} onChange={v=>setS({...s,course:v})}/><A label="12. Procedures performed" value={s.procedures} onChange={v=>setS({...s,procedures:v})}/><A label="13. Investigations advised / results" value={s.investigations} onChange={v=>setS({...s,investigations:v})}/><A label="14. Treatment on discharge" value={s.dischargeTreatment} onChange={v=>setS({...s,dischargeTreatment:v})}/><F label="15. Follow-up date" value={s.followUpDate} onChange={v=>setS({...s,followUpDate:v})}/><div className="md:col-span-2"><F label="16. Follow-up consultant" value={s.followUpConsultant} onChange={v=>setS({...s,followUpConsultant:v})}/></div></div>
 {finalized?<div className="mt-4 flex flex-wrap gap-2"><Link href={`/ipd-summaries/${selected.id}/print`} target="_blank" className="h-9 px-4 inline-flex items-center rounded-lg bg-[#c2183a] text-white text-xs font-semibold">Print Final Discharge Summary</Link><Link href="/ipd" className="h-9 px-4 inline-flex items-center rounded-lg border text-xs font-semibold">Return to IPD</Link></div>:<><button type="submit" disabled={saving||discharging} className="mt-3 h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs">{saving?"Saving…":`Save ${type} Draft`}</button>{type==="Discharge Summary"&&<button type="button" onClick={discharge} disabled={saving||discharging} className="mt-3 ml-2 h-9 px-4 rounded-lg border border-red-300 text-red-700 text-xs font-medium">{discharging?"Finalizing & Discharging…":"Finalize & Discharge Patient"}</button>}</>}</form>}</section></div></div></AppShell>;
}
