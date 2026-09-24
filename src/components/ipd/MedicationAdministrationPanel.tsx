"use client";

import { useEffect, useMemo, useState } from "react";

type Props = { patient: any };

const routes = ["Oral","IV","IM","SC","SL","Topical","Inhaled","Nebulised","Rectal","Vaginal","NG","PEG","Other"];
const units = ["mg","g","micrograms","mL","units","tablet","capsule","puff","ampoule","Other"];
const frequencies = [
  ["OD","Once daily"],["BD","Twice daily"],["TDS","Three times daily"],["QDS","Four times daily"],
  ["TID","Three times daily"],["QID","Four times daily"],["OM","Every morning"],["ON","Every night"],
  ["PRN","As required"],["STAT","Immediately / once"],["Q4H","Every 4 hours"],["Q6H","Every 6 hours"],
  ["Q8H","Every 8 hours"],["Q12H","Every 12 hours"],["Weekly","Once weekly"],["Fortnightly","Once every 2 weeks"],
  ["Monthly","Once monthly"],["Custom","Custom interval"]
] as const;

function medicationLines(medicines: string) {
  return String(medicines || "").split(/[\n;]+/).map((x) => x.trim()).filter(Boolean);
}

export default function MedicationAdministrationPanel({ patient }: Props) {
  const [data,setData]=useState<{prescriptions:any[];administrations:any[]}>({prescriptions:[],administrations:[]});
  const [selectedPrescriptionId,setSelectedPrescriptionId]=useState("");
  const [medicationText,setMedicationText]=useState("");
  const [medicationName,setMedicationName]=useState("");
  const [dose,setDose]=useState("");
  const [doseUnit,setDoseUnit]=useState("mg");
  const [frequency,setFrequency]=useState("OD");
  const [route,setRoute]=useState("Oral");
  const [scheduledAt,setScheduledAt]=useState(()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16));
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function load(){
    const res=await fetch("/api/ipd/medications?patientId="+encodeURIComponent(patient.id),{credentials:"include",cache:"no-store"});
    const body=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(body.error||"Could not load medication administration record");
    setData({prescriptions:body.prescriptions||[],administrations:body.administrations||[]});
  }
  useEffect(()=>{if(!patient?.id)return;setSelectedPrescriptionId("");setMedicationText("");setMedicationName("");setFrequency("OD");setMessage("");setError("");void load().catch((e)=>setError(e.message));},[patient?.id]);
  const selectedPrescription=useMemo(()=>data.prescriptions.find((p)=>p.id===selectedPrescriptionId),[data.prescriptions,selectedPrescriptionId]);
  const medicationOptions=useMemo(()=>medicationLines(selectedPrescription?.medicines||""),[selectedPrescription]);
  function selectMedication(value:string){setMedicationText(value);setMedicationName(value.split(/\s+/).slice(0,3).join(" "));}
  async function schedule(e:React.FormEvent){
    e.preventDefault();
    if(!selectedPrescriptionId||!medicationText||!medicationName||!dose||!route||!frequency||!scheduledAt){setError("Select the medication order and complete medication, dose, frequency, route and scheduled time.");return;}
    setBusy(true);setError("");setMessage("");
    try{
      const res=await fetch("/api/ipd/medications",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({patientId:patient.id,prescriptionId:selectedPrescriptionId,medicationText,medicationName,dose,doseUnit,frequency,route,scheduledAt:new Date(scheduledAt).toISOString(),notes})});
      const body=await res.json().catch(()=>({}));
      if(!res.ok||!body.success)throw new Error(body.error||"Could not schedule dose");
      setMessage("Dose scheduled. Pharmacy dispensing does not mark it administered.");
      setDose("");setNotes("");await load();
    }catch(e:any){setError(e.message||"Could not schedule dose")}finally{setBusy(false)}
  }
  async function updateStatus(id:string,status:string){
    if(status==="ADMINISTERED"&&!window.confirm("Confirm that you personally administered this medication dose?"))return;
    if(status!=="ADMINISTERED"&&!window.confirm("Record this dose as "+status.toLowerCase()+"?"))return;
    let reason="";
    if(["HELD","OMITTED","REFUSED","CANCELLED"].includes(status)){reason=window.prompt("Reason required for "+status.toLowerCase()+":")?.trim()||"";if(!reason)return;}
    setBusy(true);setError("");setMessage("");
    try{
      const res=await fetch("/api/ipd/medications",{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status,reason})});
      const body=await res.json().catch(()=>({}));
      if(!res.ok||!body.success)throw new Error(body.error||"Could not update dose");
      setMessage("Medication administration status recorded: "+status);await load();
    }catch(e:any){setError(e.message||"Could not update dose")}finally{setBusy(false)}
  }
  return <div className="border rounded-xl p-3 md:col-span-2">
    <div className="mb-3"><h4 className="font-semibold text-xs">Medication Administration Record</h4><p className="text-[10px] text-gray-500">One-line medication schedule: order · medication · dose · frequency · route · time · status. Dispensed never means administered.</p></div>
    {(error||message)&&<div className={error?"mb-3 rounded-lg bg-red-50 px-2 py-2 text-[10px] text-red-700":"mb-3 rounded-lg bg-green-50 px-2 py-2 text-[10px] text-green-700"}>{error||message}</div>}
    <div className="overflow-x-auto -mx-1 px-1">
      <form onSubmit={schedule} className="min-w-[1120px] flex items-center gap-2">
        <select required value={selectedPrescriptionId} onChange={(e)=>{setSelectedPrescriptionId(e.target.value);setMedicationText("");setMedicationName("");}} className="h-9 w-44 shrink-0 rounded-lg border px-2 text-xs"><option value="">Medication order</option>{data.prescriptions.map((p)=><option key={p.id} value={p.id}>{p.id.slice(0,8)} · {p.pharmacyStatus}</option>)}</select>
        <select required value={medicationText} onChange={(e)=>selectMedication(e.target.value)} className="h-9 w-56 shrink-0 rounded-lg border px-2 text-xs"><option value="">Ordered medication</option>{medicationOptions.map((x)=><option key={x} value={x}>{x}</option>)}</select>
        <input required value={medicationName} onChange={(e)=>setMedicationName(e.target.value)} placeholder="Medication" className="h-9 w-36 shrink-0 rounded-lg border px-2 text-xs"/>
        <input required value={dose} onChange={(e)=>setDose(e.target.value)} placeholder="Dose" className="h-9 w-20 shrink-0 rounded-lg border px-2 text-xs"/>
        <select value={doseUnit} onChange={(e)=>setDoseUnit(e.target.value)} className="h-9 w-24 shrink-0 rounded-lg border px-2 text-xs">{units.map((x)=><option key={x}>{x}</option>)}</select>
        <select required value={frequency} onChange={(e)=>setFrequency(e.target.value)} className="h-9 w-36 shrink-0 rounded-lg border px-2 text-xs">{frequencies.map(([code,label])=><option key={code} value={code}>{code} · {label}</option>)}</select>
        <select required value={route} onChange={(e)=>setRoute(e.target.value)} className="h-9 w-24 shrink-0 rounded-lg border px-2 text-xs">{routes.map((x)=><option key={x}>{x}</option>)}</select>
        <input required type="datetime-local" value={scheduledAt} onChange={(e)=>setScheduledAt(e.target.value)} className="h-9 w-40 shrink-0 rounded-lg border px-2 text-xs"/>
        <input value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Note" className="h-9 w-32 shrink-0 rounded-lg border px-2 text-xs"/>
        <button disabled={busy} className="h-9 shrink-0 rounded-lg bg-[#140a1f] px-3 text-xs text-white disabled:opacity-50">{busy?"Saving…":"Schedule"}</button>
      </form>
    </div>
    <div className="mt-4 overflow-x-auto">
      {data.administrations.length===0?<p className="text-[10px] text-gray-500">No medication-administration events recorded for this IPD patient.</p>:
        <div className="min-w-[1120px] rounded-lg border">
          <div className="flex items-center gap-3 border-b bg-gray-50 px-2.5 py-2 text-[10px] font-semibold text-gray-500"><span className="w-36 shrink-0">Medication</span><span className="w-20 shrink-0">Dose</span><span className="w-24 shrink-0">Frequency</span><span className="w-20 shrink-0">Route</span><span className="w-40 shrink-0">Scheduled</span><span className="w-28 shrink-0">Status</span><span className="w-44 shrink-0">Reason</span><span className="flex-1">Staff</span><span className="w-40 shrink-0">Action</span></div>
          {data.administrations.map((a)=><div key={a.id} className="flex items-center gap-3 border-b last:border-0 px-2.5 py-2 text-[10px]">
            <span className="w-36 shrink-0 font-semibold text-xs truncate">{a.medicationName}</span><span className="w-20 shrink-0">{a.dose} {a.doseUnit}</span><span className="w-24 shrink-0 font-medium">{a.frequency||"OD"}</span><span className="w-20 shrink-0">{a.route}</span><span className="w-40 shrink-0 text-gray-500">{new Date(a.scheduledAt).toLocaleString()}</span><span className="w-28 shrink-0 font-semibold">{a.status}</span><span className="w-44 shrink-0 text-gray-500 truncate" title={a.reason||""}>{a.reason||"—"}</span><span className="flex-1 text-gray-500 truncate">{a.actor}{a.staffCode?" · "+a.staffCode:""}</span>
            <span className="w-40 shrink-0 flex gap-1">{a.status==="SCHEDULED"&&<><button disabled={busy} onClick={()=>updateStatus(a.id,"ADMINISTERED")} className="rounded bg-[#c2183a] px-2 py-1 text-[10px] font-semibold text-white">Administered</button><button disabled={busy} onClick={()=>updateStatus(a.id,"HELD")} className="rounded border px-2 py-1">Held</button><button disabled={busy} onClick={()=>updateStatus(a.id,"OMITTED")} className="rounded border px-2 py-1">Omit</button></>}</span>
          </div>)}
        </div>}
    </div>
  </div>;
}
