"use client";

import { useState } from "react";

type Props = { patientId: string; encounters: any[]; labs?: any[]; diagnostics?: any[]; prescriptions?: any[]; notes?: any[]; profile?: Record<string, any>; onSaved?: () => Promise<void> | void };

export default function LongitudinalCaseSummary({patientId,encounters,labs=[],diagnostics=[],prescriptions=[],notes=[],profile={},onSaved}:Props) {
  const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(""),[draft,setDraft]=useState(""),[sourceCount,setSourceCount]=useState(0);
  async function generate() {
    setBusy(true); setError(""); setDraft("");
    try {
      const events:{at:string;kind:string;title:string;detail:string}[]=[];
      const add=(at:any,kind:string,title:any,detail:any)=>{const d=String(detail||"").trim(),t=String(title||"").trim();if(d||t)events.push({at:String(at||""),kind,title:t||kind,detail:d||t});};
      for(const e of encounters||[]) add(e.createdAt||e.date,"Clinical encounter",e.chiefComplaint||e.diagnosis||"Encounter",[
        e.chiefComplaint&&"Complaint: "+e.chiefComplaint,e.assessment&&"Assessment: "+e.assessment,e.diagnosis&&"Diagnosis: "+e.diagnosis,e.clinicalNotes&&"Notes: "+e.clinicalNotes,e.plan&&"Plan: "+e.plan,
        e.bp&&"BP: "+e.bp,e.pulse&&"Pulse: "+e.pulse,e.rr&&"RR: "+e.rr,e.spo2&&"SpO₂: "+e.spo2,e.temperature&&"Temperature: "+e.temperature,e.weight&&"Weight: "+e.weight
      ].filter(Boolean).join("; "));
      for(const n of notes||[]) add(n.createdAt||n.updatedAt,"Clinical note",n.title||n.noteType,"Status: "+(n.status||"unknown")+"; "+(n.content||""));
      for(const l of labs||[]) add(l.resultedAt||l.completedAt||l.orderedAt||l.createdAt,"Laboratory",l.testName||l.name||"Investigation","Result: "+(l.result||"not recorded")+"; Status: "+(l.status||"unknown"));
      for(const d of diagnostics||[]) add(d.reportedAt||d.orderedAt||d.createdAt,"Diagnostic",d.studyName||d.testName||"Diagnostic study","Modality: "+(d.modality||"not recorded")+"; Result/impression: "+(d.impression||d.result||"not recorded")+"; Status: "+(d.status||"unknown"));
      for(const p of prescriptions||[]) add(p.createdAt||p.orderedAt||p.startDate,"Medication",p.medicationName||p.name||"Prescription",p.medicines||p.instructions||p.dose||p.status||"Details not recorded");
      events.sort((a,b)=>(new Date(a.at).getTime()||0)-(new Date(b.at).getTime()||0));
      if(!events.length) throw new Error("No clinical history was found to summarize.");
      setSourceCount(events.length);
      const days=new Map<string,typeof events>();
      for(const e of events){const d=new Date(e.at);const day=e.at&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(d):"Date not recorded";days.set(day,[...(days.get(day)||[]),e]);}
      const timeline=[...days.entries()].map(([day,rows])=>"DAY: "+day+"\n"+rows.map(x=>"- ["+x.kind+"] "+x.title+": "+x.detail).join("\n")).join("\n\n");
      const profileText=["Patient: "+(profile.name||"Not recorded"),"Age: "+(profile.age||"Not recorded"),"Gender: "+(profile.gender||"Not recorded"),"UHID: "+(profile.uhid||"Not recorded"),"Allergies: "+(profile.allergies||"Not recorded"),"Admission date: "+(profile.admissionDate||profile.admittedAt||"Not confirmed"),"Discharge date: "+(profile.dischargeDate||"Not confirmed"),"Diagnosis: "+(profile.workingDiagnosis||profile.diagnosis||"Not recorded")].join("\n");
      const r=await fetch("/api/clinical-ai/draft",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","X-MedLum-Requested-With":"MedLum"},body:JSON.stringify({patientId,patientName:profile.name||undefined,age:profile.age||undefined,gender:profile.gender||undefined,allergies:profile.allergies||undefined,chiefComplaint:profile.chiefComplaint||encounters[0]?.chiefComplaint||"",diagnosis:profile.workingDiagnosis||profile.diagnosis||encounters[0]?.diagnosis||"",clinicalNotes:"CHRONOLOGICAL SOURCE TIMELINE — do not invent or reorder events:\n"+profileText+"\n\n"+timeline,clinicianNotes:"Generate an editable inpatient longitudinal case summary organized by calendar day from admission through discharge or latest available date. For each day include complaints/course, examination and vital signs, lab findings, diagnostic/radiology findings, medication/treatment and documented response, precautions/nursing care/intake-output when available, and plan. Include admission overview and discharge/outcome only when supported. Preserve dates and units; distinguish orders from results. Mark missing information not documented. Never infer normal findings, diagnosis, dose, treatment response, admission/discharge dates. Clinician must review; do not sign/finalize.",noteType:"Case Summary"})});
      const j=await r.json().catch(()=>({}));if(!r.ok||!j.success||!j.draft?.combined)throw new Error(j.error||"AI case summary could not be generated.");setDraft(String(j.draft.combined));
    } catch(e){setError(e instanceof Error?e.message:"AI case summary could not be generated.");} finally{setBusy(false);}
  }
  async function save(){setSaving(true);setError("");try{const r=await fetch("/api/clinical-notes",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","X-MedLum-Requested-With":"MedLum"},body:JSON.stringify({patientId,noteType:"Case Summary",title:"AI-assisted longitudinal case summary",content:draft.trim(),submit:false})});const j=await r.json().catch(()=>({}));if(!r.ok||!j.success)throw new Error(j.error||"Could not save case summary.");setDraft("");await onSaved?.();}catch(e){setError(e instanceof Error?e.message:"Could not save case summary.");}finally{setSaving(false);}}
  return <section className="overflow-hidden rounded-xl border border-violet-200 bg-white">
    <div className="border-b bg-violet-50 px-3 py-3"><h3 className="text-sm font-semibold text-gray-900">AI longitudinal case summary</h3><p className="mt-1 text-[11px] text-gray-600">Combines available clinical notes, encounters, vitals, lab results, diagnostics and prescriptions into a day-by-day editable draft. Missing data is not inferred.</p></div>
    <div className="space-y-2 p-3"><button type="button" onClick={()=>void generate()} disabled={busy} className="h-11 w-full rounded-lg bg-[#140a1f] px-3 text-sm font-semibold text-white disabled:opacity-60">{busy?"Pulling chart history and generating…":"Generate case summary from all available history"}</button>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
    {draft&&<><p className="text-[11px] text-gray-500">Source events considered: {sourceCount}. AI draft — clinician must verify dates, results and treatments.</p><textarea aria-label="Generated longitudinal case summary" value={draft} onChange={e=>setDraft(e.target.value)} className="min-h-[22rem] w-full rounded-lg border px-3 py-2 text-xs leading-5"/><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>void save()} disabled={saving||!draft.trim()} className="h-10 rounded-lg bg-[#c2183a] px-2 text-xs font-semibold text-white disabled:opacity-60">{saving?"Saving…":"Save as draft note"}</button><button type="button" onClick={()=>setDraft("")} className="h-10 rounded-lg border px-2 text-xs font-medium">Discard draft</button></div></>}</div>
  </section>;
}
