"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useDoctor } from "@/components/DoctorProvider";

type Hospital={id:string;name:string;doctors:number;patients:number;invoices:number;activeIpd:number;collectedRevenue:number;isActive:boolean;facilityStatus:string;statusReason:string};
type Data={hospitals:Hospital[];platform:{activeHospitals:number;activeDoctors:number;totalPatients:number;collectedClinicalRevenue:number;collectedThisMonth:number}};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(v);

function FacilityControls({facility,onDone}:{facility:Hospital;onDone:()=>void}){
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const [error,setError]=useState("");
 const changeStatus=async(status:string,reason:string)=>{setBusy(true);setError("");setMessage("");try{const r=await fetch(`/api/owner/facilities/${facility.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,reason})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to update facility");setMessage(`Facility status changed to ${status}.`);onDone();}catch(e){setError(e instanceof Error?e.message:"Unable to update facility");}finally{setBusy(false);}};
 const remove=async()=>{if(window.prompt(`Type "${facility.name}" to permanently delete this facility.`)!==facility.name)return;const reason=window.prompt("Why is this facility being permanently deleted?");if(!reason?.trim())return;setBusy(true);setError("");try{const r=await fetch(`/api/owner/facilities/${facility.id}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirmName:facility.name,reason:reason.trim()})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to delete facility");window.location.href="/owner/hospitals";}catch(e){setError(e instanceof Error?e.message:"Unable to delete facility");}finally{setBusy(false);}};
 return <div className="mt-4 flex flex-col gap-3"><div className="flex flex-wrap gap-2">{facility.isActive&&<><button disabled={busy} onClick={()=>changeStatus("GRACE_PERIOD","Payment grace period")} className="rounded-lg border px-3 py-2 text-sm">Grace period</button><button disabled={busy} onClick={()=>changeStatus("SUSPENDED","Manual Master Owner suspension")} className="rounded-lg border px-3 py-2 text-sm">Suspend access</button><button disabled={busy} onClick={()=>changeStatus("LICENSE_EXPIRED","License expired")} className="rounded-lg border px-3 py-2 text-sm">License expired</button><button disabled={busy} onClick={()=>changeStatus("COMPLIANCE_HOLD","Compliance documentation issue")} className="rounded-lg border px-3 py-2 text-sm">Compliance hold</button><button disabled={busy} onClick={()=>changeStatus("FRAUD_HOLD","Fraud/security concern")} className="rounded-lg border px-3 py-2 text-sm">Fraud hold</button><button disabled={busy} onClick={()=>changeStatus("DEACTIVATED","Manual Master Owner deactivation")} className="rounded-lg border px-3 py-2 text-sm">Deactivate</button></>}{!facility.isActive&&<button disabled={busy} onClick={()=>changeStatus("ACTIVE","Master Owner reactivation")} className="rounded-lg bg-[#c2183a] px-3 py-2 text-sm font-semibold text-white">Reactivate</button>}<button disabled={busy} onClick={remove} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">Delete empty/test facility</button></div>{message&&<p className="text-sm text-emerald-700">{message}</p>}{error&&<p className="text-sm text-red-700">{error}</p>}</div>}

type FacilityTelegramDiagnostics = {
 webhookUrlMatches: boolean;
 expectedWebhookUrl: string;
 actualWebhookUrl: string | null;
 pendingUpdateCount: number;
 lastErrorAt: string | null;
 lastErrorMessage: string | null;
 connectionLinkExpired: boolean;
 hasChat: boolean;
 status: string;
 botUsername: string | null;
};

function HospitalTelegramControls({clinicId}:{clinicId:string}) {
 const [status,setStatus]=useState("LOADING");
 const [configured,setConfigured]=useState(false);
 const [connected,setConnected]=useState(false);
 const [botUsername,setBotUsername]=useState("");
 const [link,setLink]=useState("");
 const [expiresAt,setExpiresAt]=useState("");
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [diagnostics,setDiagnostics]=useState<FacilityTelegramDiagnostics|null>(null);

 const refresh=useCallback(async()=>{
  try{
   const r=await fetch(`/api/owner/facilities/${encodeURIComponent(clinicId)}/telegram/connect`,{method:"GET",credentials:"include",cache:"no-store"});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Unable to check Telegram status");
   setConfigured(Boolean(d.configured));setConnected(Boolean(d.connected));
   setBotUsername(String(d.botUsername||""));
   const expiry=String(d.connectionExpiresAt||"");
   setExpiresAt(expiry);
   const rawStatus=String(d.status||"NOT_CONFIGURED");
   setStatus(!d.connected&&rawStatus==="PENDING"&&expiry&&Date.parse(expiry)<=Date.now()?"EXPIRED":rawStatus);
   if(d.connected){setLink("");setExpiresAt("");setError("");}
  }catch(e){setError(e instanceof Error?e.message:"Unable to check Telegram status");}
 },[clinicId]);

 useEffect(()=>{
  let active=true;
  const run=async()=>{if(active)await refresh();};
  void run();
  const timer=window.setInterval(()=>void run(),5000);
  return ()=>{active=false;window.clearInterval(timer);};
 },[refresh]);

 const connect=async()=>{
  setBusy("connect");setError("");setMessage("");setDiagnostics(null);setLink("");
  try{
   const r=await fetch(`/api/owner/facilities/${encodeURIComponent(clinicId)}/telegram/connect`,{method:"POST",credentials:"include",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"connect"})});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Could not prepare Telegram connection");
   setLink(String(d.deepLink||""));setExpiresAt(String(d.expiresAt||""));setBotUsername(String(d.botUsername||""));
   setConnected(false);setStatus("PENDING");
   setMessage("A fresh one-time link is ready. Open this exact link in the intended hospital owner's Telegram account and tap Start within 30 minutes.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Could not prepare Telegram connection");}
  finally{setBusy("");}
 };

 const repairWebhook=async()=>{
  setBusy("repair");setError("");setMessage("");setDiagnostics(null);
  try{
   const r=await fetch(`/api/owner/facilities/${encodeURIComponent(clinicId)}/telegram/connect`,{method:"POST",credentials:"include",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"repair-webhook"})});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Could not diagnose Telegram webhook");
   setDiagnostics(d.diagnostics||null);
   setMessage(String(d.message||"Webhook diagnostics completed."));
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Could not diagnose Telegram webhook");}
  finally{setBusy("");}
 };

 const sendTest=async()=>{
  setBusy("test");setError("");setMessage("");
  try{
   const r=await fetch(`/api/owner/facilities/${encodeURIComponent(clinicId)}/telegram/test`,{method:"POST",credentials:"include",cache:"no-store"});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Test notification could not be sent");
   setMessage(String(d.message||"Test notification sent to the linked facility chat."));
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Test notification could not be sent");}
  finally{setBusy("");}
 };

 const statusLabel=connected?"CONNECTED":status==="PENDING"?"WAITING FOR TELEGRAM START":status==="EXPIRED"?"LINK EXPIRED — GENERATE A FRESH LINK":status==="ERROR"?"CONNECTION ERROR":status==="NOT_CONFIGURED"?"NOT CONFIGURED":status==="LOADING"?"CHECKING…":status;
 const badgeClass=connected?"bg-emerald-100 text-emerald-800":status==="ERROR"?"bg-red-100 text-red-800":status==="EXPIRED"?"bg-red-100 text-red-800":"bg-amber-100 text-amber-900";

 return <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 className="font-semibold">Facility Telegram</h3>
   <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>{statusLabel}</span>
  </div>
  <p className="mt-2 text-sm text-slate-600">The bot must be connected through the one-time link for this selected hospital. Sending /start by opening the bot manually is not enough.</p>
  {botUsername&&<p className="mt-2 text-sm text-slate-600">Bot: @{botUsername}</p>}
  {connected&&<p className="mt-2 text-sm text-emerald-800">Connection confirmed. Use “Send test notification” to verify outbound delivery to this facility chat.</p>}
  {!configured&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">No enabled bot token is configured for this facility. A connection link alone cannot fix a missing or invalid BotFather token.</p>}
  {configured&&<div className="mt-3 flex flex-wrap gap-2">
   <button type="button" disabled={!!busy} onClick={()=>void connect()} className="min-h-11 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy==="connect"?"Preparing secure link…":status==="EXPIRED"||link?"Generate a fresh link":"Connect / generate link"}</button>
   <button type="button" disabled={!!busy} onClick={()=>void repairWebhook()} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50">{busy==="repair"?"Checking Telegram…":"Diagnose / repair webhook"}</button>
   <button type="button" disabled={!!busy||!connected} onClick={()=>void sendTest()} className="min-h-11 rounded-xl bg-[#c2183a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy==="test"?"Sending test…":"Send test notification"}</button>
  </div>}
  {link&&<div className="mt-3 rounded-lg border border-slate-200 bg-white p-3"><p className="text-sm font-semibold">Fresh one-time link</p><a href={link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-[#229ED9] px-4 py-2 text-sm font-semibold text-white">Open this link in Telegram ↗</a>{expiresAt&&<p className="mt-2 text-xs text-slate-500">Expires: {new Date(expiresAt).toLocaleString()}</p>}<p className="mt-2 break-all text-xs text-slate-500">{link}</p><p className="mt-2 text-xs text-slate-600">Do not open the bot manually. Tap the link above, then tap Start. If no reply appears, run webhook diagnostics and generate a new link.</p></div>}
  {diagnostics&&<div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
   <p className="font-semibold">Telegram webhook diagnostics</p>
   <p className={diagnostics.webhookUrlMatches?"mt-2 text-emerald-700":"mt-2 text-red-700"}>Webhook URL: {diagnostics.webhookUrlMatches?"verified":"does not match expected URL"}</p>
   <p className="mt-1 text-xs text-slate-600">Expected: {diagnostics.expectedWebhookUrl}</p>
   <p className="mt-1 break-all text-xs text-slate-600">Telegram currently has: {diagnostics.actualWebhookUrl||"no webhook registered"}</p>
   <p className="mt-1 text-xs text-slate-600">Pending Telegram updates: {diagnostics.pendingUpdateCount}</p>
   {diagnostics.lastErrorAt&&<p className="mt-1 text-xs text-slate-600">Last delivery error: {new Date(diagnostics.lastErrorAt).toLocaleString()}</p>}
   {diagnostics.lastErrorMessage&&<p className="mt-1 rounded bg-red-50 p-2 text-xs text-red-800">{diagnostics.lastErrorMessage}</p>}
   {diagnostics.connectionLinkExpired&&<p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">The previous connection link has expired. Generate a fresh link.</p>}
  </div>}
  {message&&<p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
  {error&&<p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
 </section>;
}

function FacilityGeofenceControls({clinicId}:{clinicId:string}) {
 const [status,setStatus]=useState("LOADING");
 const [enabled,setEnabled]=useState(false);
 const [hasCoordinates,setHasCoordinates]=useState(false);
 const [lat,setLat]=useState<number|null>(null);
 const [lng,setLng]=useState<number|null>(null);
 const [radius,setRadius]=useState(200);
 const [label,setLabel]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");

 const refresh=useCallback(async()=>{
  try{
   const r=await fetch(`/api/owner/facilities/${encodeURIComponent(clinicId)}/geofence`,{credentials:"include",cache:"no-store"});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Unable to load geofence status");
   setEnabled(Boolean(d.dutyEnabled));setHasCoordinates(Boolean(d.hasCoordinates));
   setLat(d.dutyLat==null?null:Number(d.dutyLat));setLng(d.dutyLng==null?null:Number(d.dutyLng));
   setRadius(Number(d.dutyRadiusMeters)||200);
   setStatus(d.dutyEnabled?"ACTIVE":d.hasCoordinates?"NEEDS_ON_SITE_VERIFICATION":"NEEDS_LOCATION");
  }catch(e){setError(e instanceof Error?e.message:"Unable to load geofence status");setStatus("ERROR");}
 },[clinicId]);
 useEffect(()=>{void refresh();},[refresh]);

 const getGps=async()=>{
  if(typeof window==="undefined"||!window.isSecureContext||!navigator.geolocation)throw new Error("Secure browser location is unavailable. Open MedLum over HTTPS and enable Location Services.");
  return new Promise<{lat:number;lng:number;accuracyMeters:number|null}>((resolve,reject)=>{
   navigator.geolocation.getCurrentPosition(
    p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracyMeters:Number.isFinite(p.coords.accuracy)?p.coords.accuracy:null}),
    e=>reject(new Error(e.code===1?"Location permission denied. Enable Location Services for Safari/Chrome and retry.":e.code===3?"GPS timed out. Retry outdoors or near a window.":"Your device could not determine its current location.")),
    {enableHighAccuracy:true,timeout:20000,maximumAge:0}
   );
  });
 };
 const locateAddress=async()=>{
  setBusy(true);setError("");setMessage("");setLabel("");
  try{
   const r=await fetch(`/api/owner/facilities/${encodeURIComponent(clinicId)}/geofence`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"geocode"})});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Could not locate the facility address");
   setLat(d.dutyLat==null?null:Number(d.dutyLat));setLng(d.dutyLng==null?null:Number(d.dutyLng));
   setRadius(Number(d.dutyRadiusMeters)||200);setEnabled(Boolean(d.dutyEnabled));setHasCoordinates(d.dutyLat!=null&&d.dutyLng!=null);
   setStatus(String(d.status||"NEEDS_ON_SITE_VERIFICATION"));setLabel(String(d.label||""));
   setMessage(String(d.message||"Address coordinates saved. Verify on-site before enabling attendance geofencing."));
  }catch(e){setError(e instanceof Error?e.message:"Could not locate the facility address");}
  finally{setBusy(false);}
 };
 const activate=async(action:"activate-address"|"activate-gps")=>{
  if(action==="activate-gps"&&!window.confirm("Use this device's current GPS as the centre of this hospital's attendance fence? Continue only when physically on this hospital campus."))return;
  setBusy(true);setError("");setMessage("");
  try{
   const gps=await getGps();
   const r=await fetch(`/api/owner/facilities/${encodeURIComponent(clinicId)}/geofence`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,currentLat:gps.lat,currentLng:gps.lng,accuracyMeters:gps.accuracyMeters,radiusMeters:radius})});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Could not activate this facility geofence");
   setEnabled(Boolean(d.dutyEnabled));setHasCoordinates(Boolean(d.dutyLat!=null&&d.dutyLng!=null));
   setLat(d.dutyLat==null?null:Number(d.dutyLat));setLng(d.dutyLng==null?null:Number(d.dutyLng));
   setRadius(Number(d.dutyRadiusMeters)||200);setStatus(String(d.status||"ACTIVE"));setMessage(String(d.message||"Attendance geofence is active."));
  }catch(e){setError(e instanceof Error?e.message:"Could not activate this facility geofence");}
  finally{setBusy(false);}
 };

 return <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 className="font-semibold">Hospital attendance geofence</h3>
   <span className={`rounded-full px-3 py-1 text-xs font-semibold ${enabled?"bg-emerald-100 text-emerald-800":status==="ERROR"?"bg-red-100 text-red-800":"bg-amber-100 text-amber-900"}`}>{enabled?"ACTIVE":status==="LOADING"?"CHECKING…":hasCoordinates?"NEEDS ON-SITE VERIFICATION":"LOCATION NOT SET"}</span>
  </div>
  <p className="mt-2 text-sm text-slate-600">Each hospital stores its own location and radius. Staff punches are checked against the selected hospital, not a shared platform-wide coordinate.</p>
  {hasCoordinates&&lat!=null&&lng!=null&&<p className="mt-2 break-words text-xs text-slate-600">Saved centre: {lat.toFixed(6)}, {lng.toFixed(6)} · radius {radius} m</p>}
  {label&&<p className="mt-2 text-xs text-slate-600">Address match: {label}</p>}
  {!enabled&&<div className="mt-3 flex flex-wrap gap-2">
   <button type="button" disabled={busy} onClick={locateAddress} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy?"Working…":hasCoordinates?"Refresh from saved address":"Locate from saved address"}</button>
   {hasCoordinates&&<button type="button" disabled={busy} onClick={()=>void activate("activate-address")} className="min-h-11 rounded-xl bg-[#140a1f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Verify address here & activate</button>}
   <button type="button" disabled={busy} onClick={()=>void activate("activate-gps")} className="min-h-11 rounded-xl bg-[#c2183a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Use current GPS & activate</button>
  </div>}
  {message&&<p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
  {error&&<p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  <p className="mt-3 text-xs text-slate-500">Use “Verify address here” only if current GPS is within 300 m of the mapped hospital. “Use current GPS” replaces the centre with this device’s position; use it only on campus. Address lookup data: © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.</p>
 </section>;
}

export default function OwnerHospitalsPage(){
 const {doctor,loading}=useDoctor(); const [data,setData]=useState<Data|null>(null); const [error,setError]=useState(""); const [selectedId,setSelectedId]=useState<string|null>(null);
 useEffect(()=>{if(!doctor?.isOwner)return;fetch("/api/owner/overview",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to load hospitals");return d}).then(setData).catch(e=>setError(e instanceof Error?e.message:"Unable to load hospitals"));},[doctor]);
 useEffect(()=>{if(selectedId){document.getElementById("selected-hospital-panel")?.scrollIntoView({behavior:"smooth",block:"start"});}},[selectedId]);
 if(loading)return <div className="min-h-screen grid place-items-center bg-[#f6f7fb] text-sm text-slate-500">Loading…</div>;
 if(!doctor)return <div className="min-h-screen grid place-items-center bg-[#f6f7fb]"><Link href="/login" className="text-[#c2183a]">Sign in</Link></div>;
 if(!doctor.isOwner)return <div className="min-h-screen grid place-items-center bg-[#f6f7fb]"><Link href="/dashboard" className="text-[#c2183a]">Open clinical workspace</Link></div>;
 const selected=data?.hospitals.find(h=>h.id===selectedId);
 return <div className="min-h-screen bg-[#f6f7fb] text-slate-900"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6"><div><Link href="/owner" className="text-lg font-bold">MedLum</Link><p className="text-xs text-slate-500">Owner → Hospitals</p></div><Link href="/owner" className="text-sm font-medium text-[#c2183a]">← Dashboard</Link></div></header>
 <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{error&&<div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-semibold">Hospitals</h1><p className="mt-1 text-sm text-slate-500">Facilities running the first MedLum product: OPD and IPD.</p></div><div className="flex items-center gap-4"><div className="text-sm text-slate-500">{data?.platform.activeHospitals??0} active · {data?.platform.activeDoctors??0} doctors</div><Link href="/owner/hospitals/new" className="rounded-xl bg-[#c2183a] px-4 py-3 text-sm font-semibold text-white">+ Add facility</Link></div></div>
 {selected&&<div id="selected-hospital-panel" className="mt-5 scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-wide text-slate-400">Selected hospital</p><h2 className="mt-1 text-xl font-semibold">{selected.name}</h2></div><button type="button" onClick={()=>setSelectedId(null)} className="text-sm text-slate-500">Clear</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[["Doctors",selected.doctors],["Patients",selected.patients],["IPD",selected.activeIpd],["Invoices",selected.invoices],["Collected",money(selected.collectedRevenue)]].map(([k,v])=><div key={String(k)} className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{k}</p><p className="mt-1 text-lg font-semibold">{v}</p></div>)}</div><HospitalTelegramControls clinicId={selected.id}/><FacilityGeofenceControls clinicId={selected.id}/></div>}
 <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-100 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:grid-cols-[1.4fr_1fr_0.6fr_0.6fr_1fr]"><span>Hospital</span><span>Status</span><span>Doctors</span><span>Patients</span><span>Collected</span></div>{(data?.hospitals??[]).map(h=><button type="button" key={h.id} onClick={()=>setSelectedId(h.id)} aria-pressed={selectedId===h.id} className={`w-full text-left grid grid-cols-[1fr_auto] gap-4 border-b border-slate-100 px-5 py-4 text-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c2183a] sm:grid-cols-[1.4fr_1fr_0.6fr_0.6fr_1fr] ${selectedId===h.id?"bg-rose-50":""}`}><span><span className="block font-medium">{h.name}</span><span className="mt-1 block text-xs text-slate-400">{h.isActive ? "Operational" : "Access blocked"}</span></span><span className="font-medium">{h.facilityStatus}</span><span>{h.doctors}</span><span>{h.patients}</span><span>{money(h.collectedRevenue)}</span></button>)}{!data?.hospitals.length&&<div className="p-10 text-center text-sm text-slate-500">No hospitals are connected yet.</div>}</div>
 <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Facility lifecycle</h2><p className="mt-1 text-sm text-slate-500">Select a hospital above to manage access. Deactivation preserves clinical data; permanent deletion is available only when no meaningful retained data exists.</p>{selected&&<FacilityControls facility={selected} onDone={()=>window.location.reload()}/>}</div> <p className="mt-6 text-xs leading-5 text-slate-400">This owner view is intentionally separate from clinical work. Hospital staff use the OPD/IPD workspace; the platform owner sees adoption, activity and recorded billing here.</p></main></div>;
}
