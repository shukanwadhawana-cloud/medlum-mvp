"use client";

// Workforce Hub: persisted, clinic-scoped HRIS/HCM workflows.

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

type Member={id:string;staffCode:string;role:string;designation:string;department:string;doctor:{name:string;email:string}};
type RecordRow={id:string;module:string;recordType:string;status:string;title:string;data:Record<string,unknown>;startAt:string|null;endAt:string|null;createdAt:string;member:Member|null};

const MODULES=[
  ["HRIS","People directory, org structure, documents"],
  ["Lifecycle","Hire, confirmation, promotion, transfer, exit, rehire"],
  ["Recruit","Jobs, candidates, screening, offers"],
  ["Onboarding","Pre-joining tasks, Day-1 checklist, surveys"],
  ["Attendance","Punches, exceptions, regularisation, reports"],
  ["Leave","Leave types, balances, requests, approvals, holidays"],
  ["Shifts & Rosters","Shift templates, rosters, overtime, coverage"],
  ["Payroll","Payroll inputs, payslips, statutory checklist"],
  ["Expenses","Claims, receipts, approvals, reimbursement"],
  ["Performance","Goals, OKR/MBO/BSC, feedback, appraisal cycles"],
  ["Learning","Courses, assignments, completion, grading"],
  ["Career & Skills","Skills matrix, gaps, development plans"],
  ["Succession","Critical roles, talent pools, readiness"],
  ["Discipline & Ethics","Cases, investigation, action, appeal, audit"],
  ["Compensation","Salary changes, increments, compensation events"],
  ["Analytics","Workforce metrics, absenteeism, attrition, headcount"],
  ["Collaboration","Announcements, tasks, appreciation, HR requests"],
] as const;

const STATUSES=["DRAFT","PENDING","APPROVED","REJECTED","ACTIVE","COMPLETED","CANCELLED"];

export default function WorkforcePage(){
  const [records,setRecords]=useState<RecordRow[]>([]);
  const [members,setMembers]=useState<Member[]>([]);
  const [module,setModule]=useState("HRIS");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [form,setForm]=useState({recordType:"Employee record",title:"",memberId:"",status:"DRAFT",startAt:"",endAt:"",data:"{}"});

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [wr,st]=await Promise.all([
        fetch("/api/workforce",{credentials:"include",cache:"no-store"}),
        fetch("/api/clinic/staff",{credentials:"include",cache:"no-store"})
      ]);
      const wj=await wr.json().catch(()=>({})), sj=await st.json().catch(()=>({}));
      if(!wr.ok) throw new Error(wj.error||"Could not load workforce hub");
      setRecords(wj.records||[]);setMembers(sj.members||[]);
    }catch(e){setError(e instanceof Error?e.message:"Could not load workforce hub");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const moduleCounts=useMemo(()=>MODULES.map(([name,countLabel])=>[name,records.filter(r=>r.module===name).length,countLabel] as const),[records]);
  const activePeople=members.filter(m=>m.role!=="Owner").length;
  const pending=records.filter(r=>r.status==="PENDING").length;

  async function createRecord(e:React.FormEvent){
    e.preventDefault();setSaving(true);setError("");setMessage("");
    let data:Record<string,unknown>;
    try{data=JSON.parse(form.data||"{}");}catch{setSaving(false);setError("Details must be valid JSON.");return;}
    try{
      const r=await fetch("/api/workforce",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({module,recordType:form.recordType,title:form.title,memberId:form.memberId||undefined,status:form.status,startAt:form.startAt||undefined,endAt:form.endAt||undefined,data})});
      const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Could not save workforce record");
      setMessage("Workforce record saved.");setForm(f=>({...f,title:"",data:"{}"}));await load();
    }catch(e){setError(e instanceof Error?e.message:"Could not save workforce record");}
    finally{setSaving(false);}
  }

  async function approve(id:string,status:"APPROVED"|"REJECTED"|"COMPLETED"){
    setError("");setMessage("");
    const r=await fetch("/api/workforce",{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});
    const j=await r.json().catch(()=>({}));if(!r.ok)setError(j.error||"Update failed");else{setMessage("Workflow status updated.");await load();}
  }

  if(loading)return <AppShell><div className="text-sm text-gray-500">Loading Workforce Hub…</div></AppShell>;

  return <AppShell>
    <div className="space-y-4">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-xl font-bold">People & Workforce</h1><p className="text-sm text-gray-500">Hospital HRIS + workforce management from hire to exit, with employee self-service and manager approvals.</p></div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Metric label="People" value={String(activePeople)}/><Metric label="Pending" value={String(pending)}/><Metric label="Records" value={String(records.length)}/>
          </div>
        </div>
      </header>

      {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message&&<div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {moduleCounts.map(([name,count,description])=><button key={name} onClick={()=>setModule(name)} className={"rounded-xl border bg-white p-3 text-left hover:border-[#c2183a] "+(module===name?"ring-2 ring-[#c2183a]/20 border-[#c2183a]":"")}><div className="font-semibold text-sm">{name}</div><div className="mt-1 text-[11px] text-gray-500">{description}</div><div className="mt-2 text-xs font-semibold text-[#c2183a]">{count} records</div></button>)}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <form onSubmit={createRecord} className="rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold">Create / initiate {module}</h2><p className="text-xs text-gray-500 mt-1">{MODULES.find(m=>m[0]===module)?.[1]}</p></div><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px]">PERSISTED</span></div>
          <div className="mt-3 space-y-2">
            <input required value={form.recordType} onChange={e=>setForm({...form,recordType:e.target.value})} placeholder="Record type (e.g. Leave request, Promotion, Candidate)" className="w-full rounded-xl border px-3 py-2.5 text-sm"/>
            <input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Title / employee action" className="w-full rounded-xl border px-3 py-2.5 text-sm"/>
            <select value={form.memberId} onChange={e=>setForm({...form,memberId:e.target.value})} className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="">Select employee / staff</option>{members.map(m=><option key={m.id} value={m.id}>{m.staffCode} · {m.doctor.name} · {m.designation||m.role}</option>)}</select>
            <div className="grid grid-cols-2 gap-2"><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="rounded-xl border bg-white px-3 py-2.5 text-sm">{STATUSES.map(s=><option key={s}>{s}</option>)}</select><input type="date" value={form.startAt} onChange={e=>setForm({...form,startAt:e.target.value})} className="rounded-xl border px-3 py-2.5 text-sm"/></div>
            <input type="date" value={form.endAt} onChange={e=>setForm({...form,endAt:e.target.value})} className="w-full rounded-xl border px-3 py-2.5 text-sm"/>
            <textarea value={form.data} onChange={e=>setForm({...form,data:e.target.value})} rows={7} className="w-full rounded-xl border px-3 py-2.5 font-mono text-xs" placeholder='{"reason":"","amount":0,"approver":"","notes":""}'/>
            <button disabled={saving} className="w-full rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving?"Saving…":"Create workflow record"}</button>
          </div>
        </form>

        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">Live workforce register</h2><p className="text-xs text-gray-500 mt-1">Clinic-scoped records with audit-backed approvals.</p></div><select value={module} onChange={e=>setModule(e.target.value)} className="rounded-lg border bg-white px-2 py-2 text-xs">{MODULES.map(([name])=><option key={name}>{name}</option>)}</select></div>
          <div className="mt-3 space-y-2 max-h-[620px] overflow-auto">
            {records.filter(r=>r.module===module).length===0&&<div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">No {module} records yet. Create the first workflow above.</div>}
            {records.filter(r=>r.module===module).map(r=><div key={r.id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-medium text-sm">{r.title}</div><div className="text-[11px] text-gray-500">{r.recordType}{r.member ? " · "+r.member.staffCode+" · "+r.member.doctor.name : ""}</div></div><span className={"rounded-full px-2 py-1 text-[10px] "+(r.status==="APPROVED"||r.status==="COMPLETED"||r.status==="ACTIVE"?"bg-green-100 text-green-700":r.status==="REJECTED"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700")}>{r.status}</span></div>
              <div className="mt-2 rounded-lg bg-gray-50 p-2 text-[11px] text-gray-600 whitespace-pre-wrap break-words">{JSON.stringify(r.data,null,2)}</div>
              {["PENDING","DRAFT"].includes(r.status)&&<div className="mt-2 flex gap-2"><button onClick={()=>approve(r.id,"APPROVED")} className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white">Approve</button><button onClick={()=>approve(r.id,"REJECTED")} className="rounded-lg border px-3 py-1.5 text-xs">Reject</button></div>}
            </div>)}
          </div>
        </section>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Workforce capability map</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Hire → Onboard","Recruit, candidate pipeline, offer and Day-1 checklists"],
            ["Manage","HRIS, employee lifecycle, attendance, leave, shifts and approvals"],
            ["Pay & Spend","Payroll inputs, payslips, compensation and expense claims"],
            ["Grow & Retain","Goals, feedback, learning, skills, career and succession"],
            ["Govern","Discipline/ethics cases, investigations, appeals and audit trail"],
            ["Workforce Intelligence","Headcount, absenteeism, leave utilisation, attrition and operational analytics"],
            ["Employee Self-Service","Own attendance, leave, expense, learning and performance workflows"],
            ["Hospital Operations","Staff ID, designation, department, active/deactive state and clinic scoping"],
          ].map(([a,b])=><div key={a} className="rounded-xl bg-gray-50 p-3"><div className="text-sm font-semibold">{a}</div><div className="mt-1 text-xs text-gray-500">{b}</div></div>)}
        </div>
      </section>
    </div>
  </AppShell>;
}

function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl border bg-white px-3 py-2 min-w-[70px]"><div className="text-lg font-bold">{value}</div><div className="text-[10px] text-gray-500">{label}</div></div>}
