"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

type Module = "overview"|"staff"|"leave"|"attendance"|"shifts"|"recruitment"|"onboarding"|"payroll"|"expenses"|"performance"|"training"|"discipline"|"compensation";
const modules: {id:Module;label:string;desc:string}[] = [
 {id:"overview",label:"Overview",desc:"Workforce dashboard"},
 {id:"staff",label:"Employees",desc:"Staff directory & lifecycle"},
 {id:"leave",label:"Leave",desc:"Requests, balances & approvals"},
 {id:"attendance",label:"Attendance",desc:"Punches & regularisation"},
 {id:"shifts",label:"Shifts & Roster",desc:"Duty planning"},
 {id:"recruitment",label:"Recruitment",desc:"Candidates & vacancies"},
 {id:"onboarding",label:"Onboarding",desc:"Joining checklist"},
 {id:"payroll",label:"Payroll",desc:"Payroll records & periods"},
 {id:"expenses",label:"Expenses",desc:"Staff claims"},
 {id:"performance",label:"Performance",desc:"Reviews & goals"},
 {id:"training",label:"Learning",desc:"Training & certifications"},
 {id:"discipline",label:"Discipline",desc:"Confidential HR records"},
 {id:"compensation",label:"Compensation",desc:"Salary structures & changes"},
];

const typeFor: Record<string,string> = {leave:"Leave request",shifts:"Roster entry",recruitment:"Candidate",onboarding:"Onboarding task",payroll:"Payroll period",expenses:"Expense claim",performance:"Performance review",training:"Training record",discipline:"HR case",compensation:"Compensation change"};

export default function PeoplePage(){
 const [tab,setTab]=useState<Module>("overview"); const [records,setRecords]=useState<any[]>([]); const [staff,setStaff]=useState<any[]>([]);
 const [loading,setLoading]=useState(false); const [error,setError]=useState(""); const [message,setMessage]=useState("");
 const [showForm,setShowForm]=useState(false); const [form,setForm]=useState({title:"",recordType:"",memberId:"",status:"DRAFT",data:"{}"});
 const [counts,setCounts]=useState<Record<string,number>>({});

 const load=useCallback(async(module?:string)=>{
   setLoading(true); setError("");
   try{ const url=module&&module!=="overview"&&module!=="staff"&&module!=="attendance"?"/api/people?module="+encodeURIComponent(module):"/api/people";
     const r=await fetch(url,{credentials:"include",cache:"no-store"}); const j=await r.json().catch(()=>({})); if(!r.ok)throw new Error(j.error||"Could not load People.");
     setRecords(j.records||[]);
     const c:Record<string,number>={}; (j.records||[]).forEach((x:any)=>{c[x.module]=(c[x.module]||0)+1}); setCounts(c);
   }catch(e){setError(e instanceof Error?e.message:"Could not load People.");} finally{setLoading(false)}
 },[]);
 const loadStaff=useCallback(async()=>{try{const r=await fetch("/api/clinic/staff?status=active",{credentials:"include",cache:"no-store"});const j=await r.json().catch(()=>({}));if(r.ok)setStaff(j.members||[])}catch{}},[]);
 useEffect(()=>{void load(tab);void loadStaff()},[tab,load,loadStaff]);

 async function save(e:React.FormEvent){e.preventDefault();setError("");setMessage("");let data:any={};try{data=JSON.parse(form.data||"{}")}catch{setError("Details must be valid JSON.");return}
   const r=await fetch("/api/people",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,module:tab,data,recordType:form.recordType||typeFor[tab]||"Record"})});
   const j=await r.json().catch(()=>({}));if(!r.ok){setError(j.error||"Could not save.");return}setMessage("People record saved.");setShowForm(false);setForm({title:"",recordType:"",memberId:"",status:"DRAFT",data:"{}"});void load(tab)
 }
 const current = tab==="overview"?"overview":tab;
 return <AppShell><div className="space-y-4">
  <div><div className="text-xs text-gray-500"><Link href="/dashboard" className="text-[#c2183a]">Dashboard</Link>{" · "}People</div><h1 className="mt-1 text-2xl font-bold">People</h1><p className="text-sm text-gray-600">MedLum workforce & HRIS workspace. Staff, attendance, leave, rostering, recruitment and employee records stay facility-scoped.</p></div>
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{modules.map(m=><button key={m.id} onClick={()=>setTab(m.id)} className={`rounded-xl border p-3 text-left ${current===m.id?"border-[#c2183a] bg-red-50":"bg-white"}`}><div className="text-sm font-semibold">{m.label}</div><div className="mt-1 text-[10px] text-gray-500">{m.desc}</div></button>)}</div>
  {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}{message&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
  {tab==="overview"&&<><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Metric label="Active employees" value={String(staff.length)}/><Metric label="Leave records" value={String(counts.leave||0)}/><Metric label="Roster records" value={String(counts.shifts||0)}/><Metric label="HR records" value={String(Object.values(counts).reduce((a,b)=>a+b,0))}/>
  </div><div className="grid gap-3 md:grid-cols-2"><Card title="People modules" text="Use the module tabs to manage the employee lifecycle. Existing Staff & Workforce remains available for operational attendance and staff administration." href="/workforce"/><Card title="Facility scoped" text="Every HRIS record is attached to the active clinic. Client-supplied clinic IDs are never used for authorization."/></div></>}
  {tab==="staff"&&<div className="rounded-2xl border bg-white p-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Employees</h2><p className="text-xs text-gray-500">Existing ClinicMember records are the canonical employee identity.</p></div><Link href="/workforce" className="rounded-lg border px-3 py-2 text-xs font-semibold">Open Staff Directory</Link></div><div className="mt-3 divide-y rounded-xl border">{staff.map((m:any)=><div key={m.id} className="flex items-center justify-between gap-3 p-3"><div><div className="font-semibold">{m.doctor?.name}</div><div className="text-xs text-gray-500">{m.staffCode} · {m.designation||m.role}{m.department?" · "+m.department:""}</div></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">Active</span></div>)}</div></div>}
  {tab==="attendance"&&<div className="rounded-2xl border bg-white p-4"><h2 className="font-semibold">Attendance</h2><p className="mt-1 text-sm text-gray-600">Punch In/Out, geofence and manager attendance board remain on the existing attendance engine.</p><Link href="/duty" className="mt-3 inline-flex rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-semibold text-white">Open Attendance / Duty</Link></div>}
  {tab!=="overview"&&tab!=="staff"&&tab!=="attendance"&&<section className="rounded-2xl border bg-white p-4">
    <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">{modules.find(x=>x.id===tab)?.label}</h2><p className="mt-1 text-xs text-gray-500">{modules.find(x=>x.id===tab)?.desc}. Records are auditable and facility-scoped.</p></div><button onClick={()=>setShowForm(v=>!v)} className="rounded-xl bg-[#c2183a] px-3 py-2 text-xs font-semibold text-white">{showForm?"Close":"Add record"}</button></div>
    {showForm&&<form onSubmit={save} className="mt-4 space-y-2 rounded-xl border bg-gray-50 p-3"><select value={form.memberId} onChange={e=>setForm({...form,memberId:e.target.value})} className="h-10 w-full rounded-lg border px-3 text-sm"><option value="">Facility-level record</option>{staff.map((m:any)=><option key={m.id} value={m.id}>{m.doctor?.name} · {m.staffCode}</option>)}</select><input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder={tab==="recruitment"?"Candidate name / vacancy":tab==="leave"?"Leave request title":"Record title"} className="h-10 w-full rounded-lg border px-3 text-sm"/><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="h-10 w-full rounded-lg border px-3 text-sm"><option>DRAFT</option><option>PENDING</option><option>APPROVED</option><option>REJECTED</option><option>COMPLETED</option><option>CANCELLED</option></select><textarea value={form.data} onChange={e=>setForm({...form,data:e.target.value})} rows={6} className="w-full rounded-lg border p-3 font-mono text-xs" placeholder='{"startDate":"2026-10-01","days":2,"reason":"Annual leave"}'/><button className="h-10 w-full rounded-lg bg-[#140a1f] text-sm font-semibold text-white">Save</button></form>}
    {loading?<div className="py-6 text-sm text-gray-500">Loading…</div>:records.length===0?<div className="py-6 text-sm text-gray-500">No records yet for this module.</div>:<div className="mt-4 divide-y rounded-xl border">{records.map((r:any)=><div key={r.id} className="p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium">{r.title}</div><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px]">{r.status}</span></div><div className="mt-1 text-xs text-gray-500">{r.member?.doctor?.name||"Facility"} · {r.member?.staffCode||""} · {new Date(r.createdAt).toLocaleDateString("en-IN")}</div><pre className="mt-2 overflow-x-auto rounded-lg bg-gray-50 p-2 text-[10px] text-gray-600">{JSON.stringify(r.data,null,2)}</pre></div>)}</div>}
  </section>}
 </div></AppShell>
}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-2xl border bg-white p-4"><div className="text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-gray-500">{label}</div></div>}
function Card({title,text,href}:{title:string;text:string;href?:string}){return <div className="rounded-2xl border bg-white p-4"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-xs text-gray-600">{text}</p>{href&&<Link href={href} className="mt-3 inline-block text-xs font-semibold text-[#c2183a]">Open →</Link>}</div>}
