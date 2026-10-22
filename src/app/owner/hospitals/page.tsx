"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDoctor } from "@/components/DoctorProvider";

type Hospital={id:string;name:string;doctors:number;patients:number;invoices:number;activeIpd:number;collectedRevenue:number;isActive:boolean;facilityStatus:string;statusReason:string};
type Data={hospitals:Hospital[];platform:{activeHospitals:number;activeDoctors:number;totalPatients:number;collectedClinicalRevenue:number;collectedThisMonth:number}};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(v);

function FacilityControls({facility,onDone}:{facility:Hospital;onDone:()=>void}){
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const [error,setError]=useState("");
 const changeStatus=async(status:string,reason:string)=>{setBusy(true);setError("");setMessage("");try{const r=await fetch(`/api/owner/facilities/${facility.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,reason})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to update facility");setMessage(`Facility status changed to ${status}.`);onDone();}catch(e){setError(e instanceof Error?e.message:"Unable to update facility");}finally{setBusy(false);}};
 const remove=async()=>{if(window.prompt(`Type "${facility.name}" to permanently delete this facility.`)!==facility.name)return;const reason=window.prompt("Why is this facility being permanently deleted?");if(!reason?.trim())return;setBusy(true);setError("");try{const r=await fetch(`/api/owner/facilities/${facility.id}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirmName:facility.name,reason:reason.trim()})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to delete facility");window.location.href="/owner/hospitals";}catch(e){setError(e instanceof Error?e.message:"Unable to delete facility");}finally{setBusy(false);}};
 return <div className="mt-4 flex flex-col gap-3"><div className="flex flex-wrap gap-2">{facility.isActive&&<><button disabled={busy} onClick={()=>changeStatus("GRACE_PERIOD","Payment grace period")} className="rounded-lg border px-3 py-2 text-sm">Grace period</button><button disabled={busy} onClick={()=>changeStatus("SUSPENDED","Manual Master Owner suspension")} className="rounded-lg border px-3 py-2 text-sm">Suspend access</button><button disabled={busy} onClick={()=>changeStatus("LICENSE_EXPIRED","License expired")} className="rounded-lg border px-3 py-2 text-sm">License expired</button><button disabled={busy} onClick={()=>changeStatus("COMPLIANCE_HOLD","Compliance documentation issue")} className="rounded-lg border px-3 py-2 text-sm">Compliance hold</button><button disabled={busy} onClick={()=>changeStatus("FRAUD_HOLD","Fraud/security concern")} className="rounded-lg border px-3 py-2 text-sm">Fraud hold</button><button disabled={busy} onClick={()=>changeStatus("DEACTIVATED","Manual Master Owner deactivation")} className="rounded-lg border px-3 py-2 text-sm">Deactivate</button></>}{!facility.isActive&&<button disabled={busy} onClick={()=>changeStatus("ACTIVE","Master Owner reactivation")} className="rounded-lg bg-[#c2183a] px-3 py-2 text-sm font-semibold text-white">Reactivate</button>}<button disabled={busy} onClick={remove} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">Delete empty/test facility</button></div>{message&&<p className="text-sm text-emerald-700">{message}</p>}{error&&<p className="text-sm text-red-700">{error}</p>}</div>}

function HospitalTelegramControls({clinicId}:{clinicId:string}) {
 const [status,setStatus]=useState("LOADING");
 const [configured,setConfigured]=useState(false);
 const [connected,setConnected]=useState(false);
 const [botUsername,setBotUsername]=useState("");
 const [link,setLink]=useState("");
 const [expiresAt,setExpiresAt]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  let active=true; let inFlight=false;
  const refresh=async()=>{
   if(inFlight)return; inFlight=true;
   try{
    const r=await fetch(`/api/owner/facilities/${encodeURIComponent(clinicId)}/telegram/connect`,{method:"GET",credentials:"include",cache:"no-store"});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Unable to check Telegram status");
    if(!active)return;
    setConfigured(Boolean(d.configured)); setConnected(Boolean(d.connected));
    setStatus(String(d.status||"NOT_CONFIGURED")); setBotUsername(String(d.botUsername||""));
    if(d.connected){setLink("");setExpiresAt("");setError("");}
   }catch(e){if(active)setError(e instanceof Error?e.message:"Unable to check Telegram status");}
   finally{inFlight=false;}
  };
  void refresh(); const timer=window.setInterval(()=>void refresh(),3500);
  return ()=>{active=false;window.clearInterval(timer);};
 },[clinicId]);
 const connect=async()=>{
  setBusy(true);setError("");setLink("");
  try{
   const r=await fetch(`/api/owner/facilities/${encodeURIComponent(clinicId)}/telegram/connect`,{method:"POST",credentials:"include",cache:"no-store"});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Could not prepare Telegram connection");
   setLink(String(d.deepLink||""));setExpiresAt(String(d.expiresAt||""));setBotUsername(String(d.botUsername||""));
   setConnected(false);setStatus("PENDING");
  }catch(e){setError(e instanceof Error?e.message:"Could not prepare Telegram connection");}
  finally{setBusy(false);}
 };
 const statusLabel=connected?"CONNECTED":status==="PENDING"?"WAITING FOR TELEGRAM START":status==="ERROR"?"CONNECTION ERROR":status==="NOT_CONFIGURED"?"NOT CONFIGURED":status==="LOADING"?"CHECKING…":status;
 return <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 className="font-semibold">Facility Telegram</h3>
   <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connected?"bg-emerald-100 text-emerald-800":status==="ERROR"?"bg-red-100 text-red-800":"bg-amber-100 text-amber-900"}`}>{statusLabel}</span>
  </div>
  {botUsername&&<p className="mt-2 text-sm text-slate-600">Bot: @{botUsername}</p>}
  {connected
   ? <p className="mt-2 text-sm text-emerald-800">Connected. The bot has accepted the secure start link and should have sent a confirmation message in Telegram.</p>
   : configured
    ? <><p className="mt-2 text-sm text-slate-600">Create a fresh one-time link, open it in the hospital owner’s Telegram account, and tap <strong>Start</strong>. This page checks connection status automatically.</p><button type="button" disabled={busy} onClick={connect} className="mt-3 min-h-11 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?"Preparing secure link…":link?"Generate a fresh link":"Connect Telegram"}</button></>
    : <p className="mt-2 text-sm text-amber-900">No enabled Telegram bot configuration was found for this facility. A connection link alone cannot fix a missing bot token.</p>}
  {link&&<div className="mt-3 rounded-lg border border-slate-200 bg-white p-3"><p className="text-sm font-medium">One-time connection link ready</p><a href={link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-[#c2183a] px-4 py-2 text-sm font-semibold text-white">Open Telegram and tap Start ↗</a>{expiresAt&&<p className="mt-2 text-xs text-slate-500">Link expires: {new Date(expiresAt).toLocaleString()}</p>}<p className="mt-2 break-all text-xs text-slate-500">{link}</p></div>}
  {error&&<p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
 </section>;
}

export default function OwnerHospitalsPage(){
 const {doctor,loading}=useDoctor(); const [data,setData]=useState<Data|null>(null); const [error,setError]=useState(""); const [selectedId,setSelectedId]=useState<string|null>(null);
 useEffect(()=>{if(!doctor?.isOwner)return;fetch("/api/owner/overview",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to load hospitals");return d}).then(setData).catch(e=>setError(e instanceof Error?e.message:"Unable to load hospitals"));},[doctor]);
 if(loading)return <div className="min-h-screen grid place-items-center bg-[#f6f7fb] text-sm text-slate-500">Loading…</div>;
 if(!doctor)return <div className="min-h-screen grid place-items-center bg-[#f6f7fb]"><Link href="/login" className="text-[#c2183a]">Sign in</Link></div>;
 if(!doctor.isOwner)return <div className="min-h-screen grid place-items-center bg-[#f6f7fb]"><Link href="/dashboard" className="text-[#c2183a]">Open clinical workspace</Link></div>;
 const selected=data?.hospitals.find(h=>h.id===selectedId);
 useEffect(()=>{if(selectedId){document.getElementById("selected-hospital-panel")?.scrollIntoView({behavior:"smooth",block:"start"});}},[selectedId]);
 return <div className="min-h-screen bg-[#f6f7fb] text-slate-900"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6"><div><Link href="/owner" className="text-lg font-bold">MedLum</Link><p className="text-xs text-slate-500">Owner → Hospitals</p></div><Link href="/owner" className="text-sm font-medium text-[#c2183a]">← Dashboard</Link></div></header>
 <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{error&&<div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-semibold">Hospitals</h1><p className="mt-1 text-sm text-slate-500">Facilities running the first MedLum product: OPD and IPD.</p></div><div className="flex items-center gap-4"><div className="text-sm text-slate-500">{data?.platform.activeHospitals??0} active · {data?.platform.activeDoctors??0} doctors</div><Link href="/owner/hospitals/new" className="rounded-xl bg-[#c2183a] px-4 py-3 text-sm font-semibold text-white">+ Add facility</Link></div></div>
 {selected&&<div id="selected-hospital-panel" className="mt-5 scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-wide text-slate-400">Selected hospital</p><h2 className="mt-1 text-xl font-semibold">{selected.name}</h2></div><button type="button" onClick={()=>setSelectedId(null)} className="text-sm text-slate-500">Clear</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[["Doctors",selected.doctors],["Patients",selected.patients],["IPD",selected.activeIpd],["Invoices",selected.invoices],["Collected",money(selected.collectedRevenue)]].map(([k,v])=><div key={String(k)} className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{k}</p><p className="mt-1 text-lg font-semibold">{v}</p></div>)}</div><HospitalTelegramControls clinicId={selected.id}/></div>}
 <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-100 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:grid-cols-[1.4fr_1fr_0.6fr_0.6fr_1fr]"><span>Hospital</span><span>Status</span><span>Doctors</span><span>Patients</span><span>Collected</span></div>{(data?.hospitals??[]).map(h=><button type="button" key={h.id} onClick={()=>setSelectedId(h.id)} aria-pressed={selectedId===h.id} className={`w-full text-left grid grid-cols-[1fr_auto] gap-4 border-b border-slate-100 px-5 py-4 text-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c2183a] sm:grid-cols-[1.4fr_1fr_0.6fr_0.6fr_1fr] ${selectedId===h.id?"bg-rose-50":""}`}><span><span className="block font-medium">{h.name}</span><span className="mt-1 block text-xs text-slate-400">{h.isActive ? "Operational" : "Access blocked"}</span></span><span className="font-medium">{h.facilityStatus}</span><span>{h.doctors}</span><span>{h.patients}</span><span>{money(h.collectedRevenue)}</span></button>)}{!data?.hospitals.length&&<div className="p-10 text-center text-sm text-slate-500">No hospitals are connected yet.</div>}</div>
 <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Facility lifecycle</h2><p className="mt-1 text-sm text-slate-500">Select a hospital above to manage access. Deactivation preserves clinical data; permanent deletion is available only when no meaningful retained data exists.</p>{selected&&<FacilityControls facility={selected} onDone={()=>window.location.reload()}/>}</div> <p className="mt-6 text-xs leading-5 text-slate-400">This owner view is intentionally separate from clinical work. Hospital staff use the OPD/IPD workspace; the platform owner sees adoption, activity and recorded billing here.</p></main></div>;
}
