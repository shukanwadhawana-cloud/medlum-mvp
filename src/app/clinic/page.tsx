"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

type EkaStatus = { provider: "EKA_ABDM"; configured: boolean; clinicId: string };
const STAFF_ROLES = ["Admin","Manager","Consultant","Doctor","RMO","Nurse","Pharmacy","Laboratory","Billing","Receptionist","Staff"];
const PRIVILEGED_ROLES = ["Owner","Admin","Manager"];

export default function ClinicPage() {
  const [data,setData]=useState<any>(null), [patients,setPatients]=useState<any[]>([]);
  const [selected,setSelected]=useState(""), [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false), [error,setError]=useState(""), [message,setMessage]=useState("");
  const [staffName,setStaffName]=useState(""), [staffEmail,setStaffEmail]=useState(""), [staffPhone,setStaffPhone]=useState("");
  const [staffRole,setStaffRole]=useState("Consultant"), [staffPassword,setStaffPassword]=useState("");
  const [telegramLinks,setTelegramLinks]=useState<Record<string,string>>({});
  const [telegramLoading,setTelegramLoading]=useState<string>("");
  const [ekaStatus,setEkaStatus]=useState<EkaStatus|null>(null), [ekaLoading,setEkaLoading]=useState(false), [ekaHipId,setEkaHipId]=useState(""), [ekaName,setEkaName]=useState("");

  async function load(){
    setLoading(true);
    try{
      const results=await Promise.all([
        fetch("/api/clinic",{credentials:"include",cache:"no-store"}),
        fetch("/api/patients",{credentials:"include",cache:"no-store"})
      ]);
      const cj=await results[0].json(), pj=await results[1].json();
      if(!results[0].ok) throw new Error(cj.error||"Could not load clinic.");
      setData(cj); setPatients(pj.patients||[]);
    }catch(e){setError(e instanceof Error?e.message:"Could not load clinic.");}
    finally{setLoading(false);}
  }
  async function loadEkaStatus(){try{const r=await fetch("/api/interoperability/eka/status",{credentials:"include",cache:"no-store"});const j=await r.json().catch(()=>({}));if(r.ok)setEkaStatus(j);}catch{}}
  useEffect(()=>{void load();},[]);
  useEffect(()=>{if(data?.currentMember&&["Owner","Admin"].includes(data.currentMember.role))void loadEkaStatus();},[data?.currentMember]);

  async function createStaff(e:React.FormEvent){
    e.preventDefault();setSaving(true);setError("");setMessage("");
    try{
      const r=await fetch("/api/clinic/staff",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:staffName,email:staffEmail,phone:staffPhone,password:staffPassword,role:staffRole})});
      const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Could not create staff account.");
      setStaffName("");setStaffEmail("");setStaffPhone("");setStaffPassword("");
      if(j.telegramLink?.deepLink && j.member?.doctor?.id) setTelegramLinks((v)=>({...v,[j.member.doctor.id]:j.telegramLink.deepLink}));
      setMessage(j.telegramLink?.deepLink?`Staff account created (${j.member?.staffCode||""}). Telegram linking is ready below.`:j.member?.staffCode?`Staff account created (${j.member.staffCode}).`:`Staff account created and added to this hospital.`);await load();
    }catch(e){setError(e instanceof Error?e.message:"Could not create staff account.");}finally{setSaving(false);}
  }
  async function linkTelegram(member:any){
    setError("");setMessage("");setTelegramLoading(member.id);
    try{
      const r=await fetch("/api/clinic/staff",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"telegram-link",memberId:member.id})});
      const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Could not prepare Telegram linking.");
      if(j.alreadyLinked){setMessage(`${member.doctor?.name||"Staff member"} already has Telegram linked.`);await load();return;}
      if(j.deepLink){setTelegramLinks((v)=>({...v,[member.doctorId]:j.deepLink}));setMessage(`Telegram link prepared for ${member.doctor?.name||"staff member"}. Open it in Telegram and press Start.`);}else throw new Error("Telegram link was not generated.");
    }catch(e){setError(e instanceof Error?e.message:"Could not prepare Telegram linking.");}finally{setTelegramLoading("");}
  }
  async function memberAction(action:"deactivate"|"reactivate"|"role",id:string,memberRole?:string){
    setError("");setMessage("");const body:any={id,action};if(action==="role")body.role=memberRole;
    const r=await fetch("/api/clinic/staff",{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const j=await r.json().catch(()=>({}));if(!r.ok)setError(j.error||"Action failed.");else{setMessage(action==="deactivate"?"Staff member deactivated (Staff ID retained).":action==="reactivate"?"Staff member reactivated (same Staff ID).":"Staff role updated (Staff ID unchanged).");await load();}
  }
  async function clinicAction(action:"deactivate-clinic"|"reactivate-clinic"){
    if(!window.confirm(action==="deactivate-clinic"?"Deactivate this clinic? Historical records will be preserved.":"Reactivate this clinic?"))return;
    const r=await fetch("/api/clinic",{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});const j=await r.json().catch(()=>({}));
    if(!r.ok)setError(j.error||"Clinic access change failed.");else{setMessage(action==="deactivate-clinic"?"Clinic deactivated. Historical records are preserved.":"Clinic reactivated.");await load();}
  }
  async function onboardEka(e:React.FormEvent){
    e.preventDefault();if(!ekaStatus?.clinicId||!ekaHipId.trim())return;setEkaLoading(true);setError("");setMessage("");
    try{const r=await fetch("/api/interoperability/eka/onboard",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({clinicId:ekaStatus.clinicId,hipId:ekaHipId.trim(),name:ekaName.trim()||data?.clinic?.name||"MedLum Clinic"})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"EKA facility onboarding failed.");setMessage("EKA ABDM facility onboarding request completed successfully.");setEkaHipId("");setEkaName("");}
    catch(e){setError(e instanceof Error?e.message:"EKA facility onboarding failed.");}finally{setEkaLoading(false);}
  }

  if(loading)return <AppShell><div className="text-sm text-gray-500">Loading clinic…</div></AppShell>;
  if(error&&!data)return <AppShell><div className="rounded-xl bg-white p-4 text-sm text-red-600">{error}</div></AppShell>;
  const canManage=["Owner","Admin"].includes(data?.currentMember?.role), canManageStaff=["Owner","Admin","Manager"].includes(data?.currentMember?.role), clinicActive=data?.clinic?.isActive!==false;

  return <AppShell>
    <div className="mb-4"><Link href="/dashboard" className="text-xs text-[#c2183a]">← Dashboard</Link><div className="mt-1 flex items-start justify-between gap-3"><div><h1 className="text-xl font-bold">Clinic</h1><p className="text-sm text-gray-500">Hospital workspace, staff management and patient portal controls.</p></div>{canManage&&<button onClick={()=>clinicAction(clinicActive?"deactivate-clinic":"reactivate-clinic")} className="rounded-xl border px-3 py-2 text-xs font-medium">{clinicActive?"Deactivate clinic":"Reactivate clinic"}</button>}</div></div>
    {error&&<div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {message&&<div className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}
    <section className="rounded-2xl bg-white p-4 border mb-3"><div className="flex items-center justify-between gap-3"><div className="text-lg font-semibold">{data?.clinic?.name}</div><span className={"rounded-full px-2.5 py-1 text-xs "+(clinicActive?"bg-green-100 text-green-700":"bg-red-100 text-red-700")}>{clinicActive?"Active":"Deactivated"}</span></div><div className="text-xs text-gray-500">Your role: {data?.currentMember?.role}{data?.currentMember?.staffCode?` · ${data.currentMember.staffCode}`:""} · {data?.members?.length||0} members</div></section>

    {canManage&&clinicActive&&<section className="rounded-2xl bg-white p-4 border mb-3"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">ABDM / EKA integration</h2><p className="text-xs text-gray-500 mt-1">Connect this clinic to EKA's ABDM facility onboarding flow.</p></div><span className={"rounded-full px-2.5 py-1 text-xs "+(ekaStatus?.configured?"bg-green-100 text-green-700":"bg-amber-100 text-amber-700")}>{ekaStatus?.configured?"Configured":"Not configured"}</span></div>{ekaStatus?.configured?<form onSubmit={onboardEka} className="mt-3 space-y-2"><input required value={ekaHipId} onChange={e=>setEkaHipId(e.target.value)} placeholder="EKA HIP ID" className="w-full rounded-xl border px-3 py-2.5 text-sm"/><input value={ekaName} onChange={e=>setEkaName(e.target.value)} placeholder={("Facility name (default: "+(data?.clinic?.name||"clinic")+")")} className="w-full rounded-xl border px-3 py-2.5 text-sm"/><button disabled={ekaLoading||!ekaHipId.trim()} className="w-full rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{ekaLoading?"Connecting…":"Onboard facility with EKA"}</button></form>:<p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">EKA credentials are not configured on this deployment. The rest of MedLum continues to work normally.</p>}</section>}

    {canManage&&clinicActive&&<section className="rounded-2xl bg-white p-4 border mb-3"><h2 className="font-semibold">Staff Management</h2><p className="mt-1 text-xs text-gray-500">Create individual hospital logins and assign department roles. Privileged Owner / Admin / Manager accounts must have Telegram linked before login.</p><form onSubmit={createStaff} className="mt-3 grid gap-2 md:grid-cols-2"><input required value={staffName} onChange={e=>setStaffName(e.target.value)} placeholder="Full name" className="w-full rounded-xl border px-3 py-2.5 text-sm"/><input required type="email" value={staffEmail} onChange={e=>setStaffEmail(e.target.value)} placeholder="Email / login" className="w-full rounded-xl border px-3 py-2.5 text-sm"/><input required value={staffPhone} onChange={e=>setStaffPhone(e.target.value)} placeholder="Phone" className="w-full rounded-xl border px-3 py-2.5 text-sm"/><input required minLength={8} type="password" value={staffPassword} onChange={e=>setStaffPassword(e.target.value)} placeholder="Initial password (8+ characters)" className="w-full rounded-xl border px-3 py-2.5 text-sm"/><select value={staffRole} onChange={e=>setStaffRole(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm bg-white">{STAFF_ROLES.map(r=><option key={r}>{r}</option>)}</select><button disabled={saving} className="rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving?"Creating…":"Create staff account"}</button></form><div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">For Owner / Admin / Manager, creation now prepares a one-time Telegram link automatically. The staff member opens it and presses Start; no Telegram username needs to be typed manually.</div></section>}

    {canManage&&clinicActive&&<section className="rounded-2xl bg-white p-4 border mb-3"><h2 className="font-semibold">Patient Portal Access</h2><p className="text-xs text-gray-500 mt-1">Create or reset a patient's portal password. Patients only receive read-only access to their own records.</p><PortalForm patients={patients} selected={selected} setSelected={setSelected} saving={saving} setSaving={setSaving} setError={setError} setMessage={setMessage}/><Link href="/portal/login" target="_blank" className="inline-block mt-3 text-xs text-[#c2183a]">Open patient portal login →</Link></section>}

    <section className="rounded-2xl bg-white border overflow-hidden"><div className="px-4 py-3 border-b font-semibold">Hospital staff & members</div><div className="divide-y">{data?.members?.map((m:any)=>{const privileged=PRIVILEGED_ROLES.includes(m.role);const canLink=canManageStaff&&clinicActive&&privileged&&(m.role!=="Owner"||m.doctorId===data?.currentMember?.doctorId);return <div key={m.id} className="p-4 flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-medium truncate">{m.doctor?.name}</div><div className="text-xs text-gray-500 truncate">{m.staffCode?<span className="mr-1 font-semibold text-[#140a1f]">{m.staffCode}</span>:null}{m.designation||m.role}{m.department?` · ${m.department}`:""}</div><div className="text-xs text-gray-500 truncate">{m.doctor?.email}{m.doctor?.phone?" · "+m.doctor.phone:""}</div><div className="mt-1 text-[11px] text-gray-500">{m.isActive&&m.doctor?.isActive?"Active":"Inactive"}{m.staffCode?` · ID retained`:""}{privileged?(m.telegramLinked?" · Telegram linked":" · Telegram not linked"):""}</div>{privileged&&telegramLinks[m.doctorId]&&<a href={telegramLinks[m.doctorId]} target="_blank" rel="noreferrer" className="inline-flex mt-2 rounded-lg bg-[#229ED9] px-3 py-1.5 text-xs font-semibold text-white">Open Telegram & Connect</a>}</div>{m.role==="Owner"?<div className="flex items-center gap-2"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">Owner</span>{canLink&&!m.telegramLinked&&<button onClick={()=>linkTelegram(m)} disabled={telegramLoading===m.id} className="rounded-lg border border-[#229ED9] px-2.5 py-1.5 text-xs font-semibold text-[#1688bd]">{telegramLoading===m.id?"Preparing…":"Link Telegram"}</button>}</div>:canManageStaff&&clinicActive?<div className="flex gap-2 items-center"><select value={m.role} onChange={e=>memberAction("role",m.id,e.target.value)} className="rounded-lg border px-2 py-1.5 text-xs">{STAFF_ROLES.map(r=><option key={r}>{r}</option>)}</select>{canLink&&!m.telegramLinked&&<button onClick={()=>linkTelegram(m)} disabled={telegramLoading===m.id} className="rounded-lg border border-[#229ED9] px-2 py-1.5 text-xs font-semibold text-[#1688bd]">{telegramLoading===m.id?"…":"Telegram"}</button>}<button onClick={()=>memberAction(m.isActive?"deactivate":"reactivate",m.id)} className="text-xs text-[#c2183a]">{m.isActive?"Deactivate":"Reactivate"}</button></div>:<span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">{m.role}</span>}</div>})}</div></section>
  </AppShell>;
}

function PortalForm({patients,selected,setSelected,saving,setSaving,setError,setMessage}:{patients:any[];selected:string;setSelected:(v:string)=>void;saving:boolean;setSaving:(v:boolean)=>void;setError:(v:string)=>void;setMessage:(v:string)=>void}){
  const [password,setPassword]=useState("");
  async function submit(e:React.FormEvent){e.preventDefault();setSaving(true);setError("");setMessage("");try{const r=await fetch("/api/portal/accounts",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({patientId:selected,password})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Could not enable portal access.");setMessage(j.created?"Patient portal access created.":"Patient portal access updated.");setPassword("");}catch(e){setError(e instanceof Error?e.message:"Could not enable portal access.");}finally{setSaving(false);}}
  return <form onSubmit={submit} className="mt-3 space-y-2"><select required value={selected} onChange={e=>setSelected(e.target.value)} className="w-full rounded-xl border px-3 py-2.5 text-sm"><option value="">Select patient</option>{patients.map(p=><option key={p.id} value={p.id}>{p.name} · {p.phone}</option>)}</select><div className="flex gap-2"><input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Portal password (8+ characters)" className="flex-1 rounded-xl border px-3 py-2.5 text-sm"/><button disabled={saving} className="rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm text-white">{saving?"Saving…":"Enable / Reset"}</button></div></form>;
}
