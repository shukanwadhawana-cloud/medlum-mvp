"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import MedicationAdministrationPanel from "@/components/ipd/MedicationAdministrationPanel";
import MedOrderPanel from "@/components/ipd/MedOrderPanel";

const WARDS=["General Ward","Twin Sharing","Single Sharing","Deluxe Ward","Super Deluxe"];
const ICUS=["ICU","MICU","SICU","Transplant ICU","PICU","NICU"];
const NOTE_TYPES=["Consultant Note","RMO Note","Nursing Care Note","Medication Indent","Investigation Indent","Fitness Note","Procedure Note","Transfer Summary","Discharge Summary","Death Summary","Case Summary","DAMA Summary","LAMA Summary"];
const LABS=["CBC","LFT","RFT / KFT","Lipid Profile","HbA1c","TSH","Urine Routine & Microscopy","Blood Sugar / RBS","Hb","WBC Count","Platelet Count","PT/INR","aPTT","Serum Electrolytes","CRP","ESR","Blood Culture","Urine Culture","Dengue NS1 / IgM","Malaria Test"];
const DIAGNOSTICS=["Chest X-ray","Abdominal X-ray","Ultrasound Abdomen","Ultrasound Pelvis","CT Head","CT Chest","CT Abdomen/Pelvis","MRI Brain","MRI Spine","2D Echo","ECG","Holter","TMT","Doppler Study","Mammography","PET-CT","Endoscopy","Colonoscopy","Bronchoscopy","Other Diagnostic"];
const DEPARTMENTS=["General Medicine","General Surgery","Gastroenterology","GI Surgery / Surgical Gastroenterology","Cardiology","Cardiothoracic & Vascular Surgery (CTVS)","Neurology","Neurosurgery","Nephrology & Dialysis","Urology","Orthopaedics","Obstetrics & Gynaecology","Paediatrics","Paediatric Surgery","Neonatology","ENT","Ophthalmology","Dermatology & Venereology","Pulmonary / Respiratory Medicine","Critical Care Medicine","Emergency Medicine & Trauma","Endocrinology","Rheumatology","Clinical Haematology","Medical Oncology","Surgical Oncology","Radiation Oncology","Plastic & Reconstructive Surgery","Anaesthesiology","Physical Medicine & Rehabilitation","Psychiatry & Mental Health","Nuclear Medicine","Radiology / Interventional Radiology","Palliative Care","Dental","Other"];

/** CPRS top tabs — only one main panel visible at a time */
const MAIN_TABS=["Cover Sheet","Dashboard","Orders","Clinical Notes","Discharge Summary","Lab","Radiology","MAR"] as const;
type MainTab=typeof MAIN_TABS[number];

/** Left nav items depend on main tab (CPRS pattern) */
const LEFT_NAV:Record<MainTab,string[]>={
  "Cover Sheet":["Overview"],
  "Dashboard":["Vitals","Problems","Final Diagnosis","Chief-Complaints","Allergies","OPD/IPD Details"],
  "Orders":["Order Medicines","Investigation Indent","Laboratory","Radiology","Procedure"],
  "Clinical Notes":["Initial Assessment","Progress Note","Consultant Note","RMO Note","Nursing Care Note","Case Summary"],
  "Discharge Summary":["Discharge Summary","DAMA Summary","LAMA Summary","Transfer Summary","Death Summary","Fitness Note"],
  "Lab":["Lab Orders","Lab Results"],
  "Radiology":["Imaging Orders","Imaging Results"],
  "MAR":["Medication Administration Record"],
};

const empty={name:"",age:"",gender:"Male",phone:"",address:"",idType:"Aadhaar",idNumber:"",allergies:"",careSetting:"IPD",mlcNumber:"",prdNumber:"",wardType:"General Ward",unitType:"Ward",roomNumber:"",chiefComplaint:"",hpi:"",pastHistory:"",surgicalHistory:"",systemicExam:"",workingDiagnosis:"",diagnosis:"",icdCode:"",consultantName:"",consultantSpecialty:"",notes:""};

export default function IPDPatientWorkspace(){
 const params=useParams<{id:string}>(); const pathname=usePathname(); const patientId=String(params?.id||""); const clinicalMode=pathname.endsWith("/clinical");
 const{doctor,loading:authLoading}=useDoctor();
 const[patients,setPatients]=useState<any[]>([]),[history,setHistory]=useState<any[]>([]),[rooms,setRooms]=useState<any[]>([]),[selected,setSelected]=useState<any>(null),[form,setForm]=useState(empty);
 const[showRegister,setShowRegister]=useState(false),[showRoom,setShowRoom]=useState(false),[showHandover,setShowHandover]=useState(false),[room,setRoom]=useState({roomNumber:"",roomCategory:"General Ward",unitType:"Ward"});
 const[note,setNote]=useState({noteType:"Consultant Note",content:""}),[investigation,setInvestigation]=useState({testName:"CBC",custom:"",notes:""}),[handover,setHandover]=useState({receivingMemberId:"",context:""}),[handoverOptions,setHandoverOptions]=useState<any[]>([]);
 const[contact,setContact]=useState({name:"",relationship:"",phone:"",alternatePhone:""}); const[vitals,setVitals]=useState({bp:"",pulse:"",rr:"",spo2:"",temperature:""});
 const[structured,setStructured]=useState({dateTime:new Date().toISOString().slice(0,16),diagnosis:"",hpi:"",allergy:"",examTime:"",cns:"",cvs:"",rs:"",perAbdomen:"",assessment:"",workingDiagnosis:"",treatmentGiven:"",course:"",procedures:"",investigations:"",dischargeTreatment:"",followUpDate:"",followUpConsultant:""});
 const[mainTab,setMainTab]=useState<MainTab>("Cover Sheet"),[leftNav,setLeftNav]=useState("Overview");
 const[currentRole,setCurrentRole]=useState(""),[department,setDepartment]=useState("General Medicine"),[selectedLabs,setSelectedLabs]=useState<string[]>([]),[selectedDiagnostics,setSelectedDiagnostics]=useState<string[]>([]),[diagnosticType,setDiagnosticType]=useState("Chest X-ray");
 const[dxForm,setDxForm]=useState({workingDiagnosis:"",diagnosis:"",icdCode:""});
 const[error,setError]=useState(""),[msg,setMsg]=useState(""),[saving,setSaving]=useState(false),[showTransfer,setShowTransfer]=useState(false),[transferRoom,setTransferRoom]=useState("");

 const load=useCallback(async()=>{const r=await fetch("/api/ipd",{credentials:"include",cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Could not load IPD workspace (${r.status})`);const ps=d.patients||[];setPatients(ps);setHistory(d.ipdHistory||[]);setRooms(d.rooms||[]);setHandoverOptions(d.handoverOptions||[]);if(d.currentRole)setCurrentRole(d.currentRole);if(d.currentDepartment)setDepartment(d.currentDepartment);const fresh=[...ps,...(d.ipdHistory||[])].find((p:any)=>p.id===patientId);if(fresh){setSelected(fresh);if(fresh.department)setDepartment(fresh.department);if(fresh.workingDiagnosis||fresh.diagnosis||fresh.icdCode)setDxForm({workingDiagnosis:fresh.workingDiagnosis||"",diagnosis:fresh.diagnosis||"",icdCode:fresh.icdCode||""});}},[patientId]);
 useEffect(()=>{if(!authLoading&&doctor)load().catch(e=>setError(e.message))},[authLoading,doctor,load]);
 useEffect(()=>{const items=LEFT_NAV[mainTab]||["Overview"];if(!items.includes(leftNav))setLeftNav(items[0]);},[mainTab,leftNav]);

 const post=async(body:any)=>{const r=await fetch("/api/ipd",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok||d.success!==true)throw new Error(d.error||`Could not save IPD record (${r.status})`);return d};
 const run=async(body:any,success:string)=>{setSaving(true);setError("");setMsg("");try{await post(body);try{await load()}catch(e:any){setError(e.message||"Saved, but the IPD workspace could not be refreshed.");return true}setMsg(success);return true}catch(e:any){setMsg("");setError(e.message||"Could not save IPD record");return false}finally{setSaving(false)}};

 const saveStructured=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;const x=structured;const content=`Date & time: ${x.dateTime}\nDiagnosis: ${x.diagnosis}\nHistory of present illness: ${x.hpi}\nAllergy: ${x.allergy}\nExamination time: ${x.examTime}\nVitals: BP ${vitals.bp} | Pulse ${vitals.pulse} | RR ${vitals.rr} | SpO₂ ${vitals.spo2} | Temperature ${vitals.temperature}\nAssessment — CNS: ${x.cns}\nAssessment — CVS: ${x.cvs}\nAssessment — Respiratory system: ${x.rs}\nAssessment — Per abdomen: ${x.perAbdomen}\nAssessment / findings: ${x.assessment}\nWorking diagnosis: ${x.workingDiagnosis}\nTreatment given: ${x.treatmentGiven}\nCourse during admission: ${x.course}\nProcedures performed: ${x.procedures}\nInvestigations advised / results: ${x.investigations}\nTreatment on discharge: ${x.dischargeTreatment}\nFollow-up date/time: ${x.followUpDate}\nFollow-up consultant: ${x.followUpConsultant || selected.consultantName || ""}`;if(!(await run({action:"clinical-note",patientId:selected.id,noteType:"Initial Assessment",title:department+" · Initial Assessment",content,authorRole:`${doctor?.name||"Logged-in clinician"} · Initial Assessment`,allergy:x.allergy,vitals},`Initial Assessment saved to IPD history`)))return;setStructured({...structured,dateTime:new Date().toISOString().slice(0,16)})};
 const saveNote=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;await run({action:"clinical-note",patientId:selected.id,noteType:note.noteType,title:`${department} · ${note.noteType}`,content:note.content,authorRole:`${doctor?.name||"Clinician"} · ${note.noteType}`},`${note.noteType} saved`)};
 const saveProgress=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;const content=`Progress Note\nAssessment: ${structured.assessment}\nCurrent meds / treatment: ${structured.treatmentGiven}\nPlan / course: ${structured.course}\nAdvice: ${structured.dischargeTreatment}\nVitals: BP ${vitals.bp} | Pulse ${vitals.pulse} | RR ${vitals.rr} | SpO₂ ${vitals.spo2} | Temp ${vitals.temperature}\nAllergy: ${selected.allergies||"NKA"}\nDiagnosis: ${selected.diagnosis||selected.workingDiagnosis||"—"}`;await run({action:"clinical-note",patientId:selected.id,noteType:"Progress Note",title:`${department} · Progress Note`,content,authorRole:`${doctor?.name||"Clinician"} · Progress Note`,vitals},`Progress Note saved`)};
 const saveDiagnosis=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;await run({action:"update-diagnosis",patientId:selected.id,...dxForm},`Diagnosis / ICD saved`)};
 const saveVitals=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;await run({action:"vitals",patientId:selected.id,vitals},`Vitals saved`)};
 const orderLabs=async(e:React.FormEvent)=>{e.preventDefault();if(!selected||!selectedLabs.length)return;await run({action:"lab-order",patientId:selected.id,tests:selectedLabs,notes:investigation.notes},`Lab order placed`);setSelectedLabs([])};
 const orderRad=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;const tests=selectedDiagnostics.length?selectedDiagnostics:[diagnosticType];await run({action:"diagnostic-order",patientId:selected.id,tests,notes:investigation.notes},`Imaging order placed`);setSelectedDiagnostics([])};
 const register=async(e:React.FormEvent)=>{e.preventDefault();if(!(await run({action:"register",...form},`${form.careSetting} patient registered`)))return;setShowRegister(false);setForm(empty)};
 const addRoom=async(e:React.FormEvent)=>{e.preventDefault();if(!(await run({action:"add-room",...room},`Room ${room.roomNumber} added`)))return;setShowRoom(false);setRoom({roomNumber:"",roomCategory:"General Ward",unitType:"Ward"})};
 const transferPatient=async(e:React.FormEvent)=>{e.preventDefault();if(!selected||!transferRoom)return;setSaving(true);try{const r=await post({action:"room-transfer",patientId:selected.id,roomNumber:transferRoom});setMsg(r.success?`Patient transferred to room / bed ${transferRoom}.`:"Transfer completed.");setShowTransfer(false);setTransferRoom("");await load()}catch(e:any){setError(e.message||"Could not transfer patient")}finally{setSaving(false)}};
 const doHandover=async(e:React.FormEvent)=>{e.preventDefault();if(!selected||!handover.receivingMemberId)return;if(!confirm("Transfer clinical responsibility for this IPD patient to the selected receiving clinician/team?"))return;setSaving(true);try{const r=await post({action:"handover",patientId:selected.id,receivingMemberId:handover.receivingMemberId,context:handover.context.trim()});setMsg(r.success?"Clinical responsibility handed over.":"Handover completed.");setShowHandover(false);setHandover({receivingMemberId:"",context:""});await load()}catch(e:any){setError(e.message||"Could not complete handover")}finally{setSaving(false)}};

 if(authLoading)return <AppShell><div className="p-6 text-sm text-gray-500">Loading…</div></AppShell>;
 if(!doctor)return <AppShell><div className="p-6 text-sm text-gray-500">Sign in to open the IPD clinical workspace.</div></AppShell>;

 if(!clinicalMode)return <AppShell><div className="p-4"><Link href="/ipd" className="text-xs text-[#c2183a] font-medium">← Back to IPD census</Link>{selected?<div className="mt-4 max-w-3xl bg-white rounded-xl border shadow-sm p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-semibold">{selected.name}</p><p className="text-xs text-gray-500">{selected.age} yrs · {selected.gender} · {selected.wardType||"Ward"} · Bed {selected.roomNumber||"Unassigned"}</p><p className="text-[11px] text-gray-500 mt-1">UHID: {selected.uhid||"—"} · MedLum ID: {selected.medlumId||"—"}</p><p className="text-[11px] text-gray-500">Admission: {selected.admissionDate?new Date(selected.admissionDate).toLocaleDateString("en-IN"):"—"}</p></div><span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${selected.status==="DISCHARGED"?"bg-gray-100 text-gray-600":"bg-purple-50 text-purple-700"}`}>{selected.status==="DISCHARGED"?"DISCHARGED":"IPD"}</span></div><div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2"><div className="border rounded-lg p-2"><p className="text-[10px] text-gray-500">BP</p><p className="font-semibold text-sm">{selected.vitals?.bp||"—"}</p></div><div className="border rounded-lg p-2"><p className="text-[10px] text-gray-500">Pulse</p><p className="font-semibold text-sm">{selected.vitals?.pulse||"—"}</p></div><div className="border rounded-lg p-2"><p className="text-[10px] text-gray-500">SpO₂</p><p className="font-semibold text-sm">{selected.vitals?.spo2||"—"}</p></div><div className="border rounded-lg p-2"><p className="text-[10px] text-gray-500">RR</p><p className="font-semibold text-sm">{selected.vitals?.rr||"—"}</p></div><div className="border rounded-lg p-2"><p className="text-[10px] text-gray-500">Allergy</p><p className="font-semibold text-sm text-red-700">{selected.allergies||"No known allergy recorded"}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/ipd/${selected.id}/clinical`} className="h-9 px-4 rounded-lg bg-[#140a1f] text-white text-xs font-semibold inline-flex items-center">Open Clinical Workspace</Link><Link href={`/patients/${selected.id}`} className="h-9 px-4 rounded-lg border text-xs inline-flex items-center">Open Patient Record</Link></div></div>:<div className="mt-4 bg-white rounded-xl border p-6 text-sm text-gray-500">IPD patient could not be found.</div>}</div></AppShell>;

 const labOrders=(selected?.labOrders||selected?.investigations||[]).filter((o:any)=>!/x-ray|ct |mri|ultrasound|echo|ecg/i.test(o.testName||o.name||""));
 const radOrders=(selected?.labOrders||selected?.investigations||[]).filter((o:any)=>/x-ray|ct |mri|ultrasound|echo|ecg/i.test(o.testName||o.name||""));
 const clinicalNotes=(selected?.clinicalNotes||selected?.notes||[]).filter((n:any)=>n.patientId===selected?.id||!n.patientId);

 return <AppShell><div className="p-3 max-w-[1400px] mx-auto">
  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
   <Link href={`/ipd/${patientId}`} className="text-xs text-[#c2183a] font-medium">← Back to IPD patient</Link>
   <div className="flex gap-2">
    <button type="button" onClick={()=>{setError("");setShowRoom(true)}} className="h-8 px-3 rounded-lg border text-xs">+ Room</button>
    <button type="button" onClick={()=>{setError("");setShowRegister(true)}} className="h-8 px-3 rounded-lg bg-[#c2183a] text-white text-xs font-medium">+ Register Patient</button>
   </div>
  </div>
  {error&&<div role="alert" aria-live="assertive" className="mb-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
  {msg&&<div role="status" aria-live="polite" className="mb-2 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">{msg}</div>}

  {!selected?<div className="bg-white rounded-xl border p-6 text-sm text-gray-500">IPD patient could not be found.</div>:(
  <>
  {/* COVER HEADER — always visible */}
  <div className="bg-white rounded-t-xl border border-b-0 shadow-sm overflow-hidden">
   <div className="grid md:grid-cols-3 gap-0 text-xs">
    <div className="p-3 border-r bg-emerald-50/40">
     <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Patient Demographic Details</p>
     <p className="font-semibold text-sm mt-1">{selected.name}</p>
     <p className="text-gray-600 mt-0.5">{selected.age} yrs · {selected.gender} · UHID {selected.uhid||"—"}</p>
     <p className="text-gray-500">MedLum ID: {selected.medlumId||"—"} · Phone: {selected.phone||"—"}</p>
    </div>
    <div className="p-3 border-r bg-sky-50/40">
     <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Admission / Location</p>
     <p className="font-semibold text-sm mt-1">{selected.wardType||"Ward"} · Bed {selected.roomNumber||"Unassigned"}</p>
     <p className="text-gray-600">Admitted: {selected.admissionDate?new Date(selected.admissionDate).toLocaleString("en-IN"):"—"}</p>
     <p className="text-gray-500">Consultant: {selected.consultantName||"—"} · {selected.consultantSpecialty||department}</p>
    </div>
    <div className="p-3 bg-amber-50/40">
     <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Clinical Alerts</p>
     <p className="font-semibold text-sm mt-1 text-red-700">Allergy: {selected.allergies||"No known allergy"}</p>
     <p className="text-gray-600">Dx: {selected.diagnosis||selected.workingDiagnosis||"—"} {selected.icdCode?`(${selected.icdCode})`:""}</p>
     <p className="text-gray-500">Status: {selected.status||"IPD"} · Role: {currentRole||"—"}</p>
    </div>
   </div>
   {/* Horizontal CPRS tabs */}
   <div className="flex flex-wrap border-t bg-slate-50">
    {MAIN_TABS.map(t=>(
     <button key={t} type="button" onClick={()=>{setMainTab(t);setLeftNav(LEFT_NAV[t][0])}}
      className={`px-3 py-2 text-[11px] font-semibold border-r border-b-2 transition ${mainTab===t?"bg-white border-b-[#c2183a] text-[#c2183a]":"border-b-transparent text-gray-600 hover:bg-white/80"}`}>{t}</button>
    ))}
   </div>
  </div>

  {/* Body: left nav + single content panel */}
  <div className="bg-white rounded-b-xl border shadow-sm flex min-h-[520px]">
   <nav className="w-48 shrink-0 border-r bg-slate-50/80 p-2 space-y-0.5">
    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">{mainTab}</p>
    {(LEFT_NAV[mainTab]||[]).map(item=>(
     <button key={item} type="button" onClick={()=>setLeftNav(item)}
      className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] font-medium ${leftNav===item?"bg-[#140a1f] text-white":"text-gray-700 hover:bg-white"}`}>{item}</button>
    ))}
   </nav>
   <div className="flex-1 p-4 overflow-auto text-xs">

    {/* COVER SHEET */}
    {mainTab==="Cover Sheet"&&(
     <div className="space-y-4">
      <h3 className="font-semibold text-sm">Cover Sheet · Clinical Snapshot</h3>
      <div className="grid md:grid-cols-2 gap-3">
       <div className="border rounded-lg p-3"><p className="font-semibold text-gray-500 mb-1">Problems / Diagnosis</p><p>{selected.diagnosis||selected.workingDiagnosis||"Not recorded"}</p>{selected.icdCode&&<p className="text-[10px] text-gray-500 mt-1">ICD-10: {selected.icdCode}</p>}</div>
       <div className="border rounded-lg p-3"><p className="font-semibold text-gray-500 mb-1">Allergies</p><p className="text-red-700 font-medium">{selected.allergies||"No Known Allergies"}</p></div>
       <div className="border rounded-lg p-3"><p className="font-semibold text-gray-500 mb-1">Active Medications</p><p className="text-gray-600">Use Orders → Order Medicines or MAR tab.</p></div>
       <div className="border rounded-lg p-3"><p className="font-semibold text-gray-500 mb-1">Lab / Radiology</p><p className="text-gray-600">Use Lab and Radiology tabs for orders and results.</p></div>
      </div>
      <table className="w-full text-left border text-[11px]"><thead className="bg-slate-50"><tr><th className="p-2 border">Admission</th><th className="p-2 border">Status</th><th className="p-2 border">Ward</th><th className="p-2 border">Bed</th><th className="p-2 border">Consultant</th></tr></thead>
      <tbody><tr><td className="p-2 border">{selected.admissionDate?new Date(selected.admissionDate).toLocaleString("en-IN"):"—"}</td><td className="p-2 border">{selected.status||"IPD"}</td><td className="p-2 border">{selected.wardType||"—"}</td><td className="p-2 border">{selected.roomNumber||"—"}</td><td className="p-2 border">{selected.consultantName||"—"}</td></tr></tbody></table>
     </div>
    )}

    {/* DASHBOARD sub-panels */}
    {mainTab==="Dashboard"&&leftNav==="Vitals"&&(
     <form onSubmit={saveVitals} className="space-y-3 max-w-xl">
      <h3 className="font-semibold text-sm">Vitals</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">{[["bp","BP"],["pulse","Pulse"],["rr","RR"],["spo2","SpO₂"],["temperature","Temperature"]].map(([k,l])=><input key={k} value={(vitals as any)[k]} onChange={e=>setVitals({...vitals,[k]:e.target.value})} placeholder={l} className="h-9 px-2 rounded-lg border text-xs"/>)}</div>
      <button disabled={saving} className="h-9 px-4 rounded-lg bg-green-700 text-white text-xs font-semibold">{saving?"Saving…":"Save vitals"}</button>
     </form>
    )}
    {mainTab==="Dashboard"&&leftNav==="Final Diagnosis"&&(
     <form onSubmit={saveDiagnosis} className="space-y-3 max-w-xl">
      <h3 className="font-semibold text-sm">Final Diagnosis · ICD-10</h3>
      <input value={dxForm.workingDiagnosis} onChange={e=>setDxForm({...dxForm,workingDiagnosis:e.target.value})} placeholder="Working diagnosis" className="w-full h-9 px-2 rounded-lg border text-xs"/>
      <input value={dxForm.diagnosis} onChange={e=>setDxForm({...dxForm,diagnosis:e.target.value})} placeholder="Final diagnosis" className="w-full h-9 px-2 rounded-lg border text-xs"/>
      <input value={dxForm.icdCode} onChange={e=>setDxForm({...dxForm,icdCode:e.target.value})} placeholder="ICD-10 code (e.g. I10, E11.9)" className="w-full h-9 px-2 rounded-lg border text-xs"/>
      <p className="text-[10px] text-gray-500">Enter the ICD-10 code that matches the diagnosis.</p>
      <button disabled={saving} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold">{saving?"Saving…":"Save Diagnosis"}</button>
     </form>
    )}
    {mainTab==="Dashboard"&&leftNav==="Problems"&&(
     <div><h3 className="font-semibold text-sm mb-2">Problems</h3><p className="text-xs text-gray-500">Document active problems in Clinical Notes → Progress Note or Initial Assessment.</p><button type="button" onClick={()=>{setMainTab("Clinical Notes");setLeftNav("Progress Note")}} className="mt-2 h-8 px-3 rounded border text-xs text-[#c2183a]">Open Progress Note</button></div>
    )}
    {mainTab==="Dashboard"&&leftNav==="Chief-Complaints"&&(
     <div className="text-xs space-y-2"><h3 className="font-semibold text-sm">Chief-Complaints</h3><p>{selected.chiefComplaint||"No chief complaint recorded at registration."}</p></div>
    )}
    {mainTab==="Dashboard"&&leftNav==="Allergies"&&(
     <div className="text-xs space-y-2"><h3 className="font-semibold text-sm">Allergies</h3><p className="text-red-700 font-medium">{selected.allergies||"No Known Allergies"}</p></div>
    )}
    {mainTab==="Dashboard"&&leftNav==="OPD/IPD Details"&&(
     <div className="text-xs space-y-2"><h3 className="font-semibold text-sm">OPD / IPD Details</h3>
      <p>Care setting: IPD · Ward: {selected.wardType||"—"} · Bed: {selected.roomNumber||"—"}</p>
      <p>Consultant: {selected.consultantName||"—"} · Specialty: {selected.consultantSpecialty||department}</p>
      <p>Admission: {selected.admissionDate?new Date(selected.admissionDate).toLocaleString("en-IN"):"—"}</p>
      <div className="flex gap-2 mt-2">
       <button type="button" onClick={()=>setShowTransfer(true)} className="h-8 px-3 rounded border text-xs">Transfer bed</button>
       <button type="button" onClick={()=>setShowHandover(true)} className="h-8 px-3 rounded border text-xs">Clinical handover</button>
      </div>
     </div>
    )}

    {/* ORDERS */}
    {mainTab==="Orders"&&leftNav==="Order Medicines"&&selected&&(
     <div><h3 className="font-semibold text-sm mb-3">Order Medicines</h3><MedOrderPanel patientId={selected.id} patientName={selected.name} /></div>
    )}
    {mainTab==="Orders"&&leftNav==="Laboratory"&&(
     <form onSubmit={orderLabs} className="space-y-3 max-w-2xl">
      <h3 className="font-semibold text-sm">Laboratory Orders</h3>
      <div className="flex flex-wrap gap-1.5">{LABS.map(l=><button type="button" key={l} onClick={()=>setSelectedLabs(s=>s.includes(l)?s.filter(x=>x!==l):[...s,l])} className={`h-7 px-2 rounded border text-[10px] ${selectedLabs.includes(l)?"bg-[#c2183a] text-white border-[#c2183a]":""}`}>{l}</button>)}</div>
      <textarea value={investigation.notes} onChange={e=>setInvestigation({...investigation,notes:e.target.value})} placeholder="Order notes / clinical indication" className="w-full min-h-16 px-2 py-1 rounded-lg border text-xs"/>
      <button disabled={saving||!selectedLabs.length} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold">{saving?"Saving…":"Place lab order"}</button>
     </form>
    )}
    {mainTab==="Orders"&&leftNav==="Radiology"&&(
     <form onSubmit={orderRad} className="space-y-3 max-w-2xl">
      <h3 className="font-semibold text-sm">Radiology / Imaging Orders</h3>
      <div className="flex flex-wrap gap-1.5">{DIAGNOSTICS.map(l=><button type="button" key={l} onClick={()=>setSelectedDiagnostics(s=>s.includes(l)?s.filter(x=>x!==l):[...s,l])} className={`h-7 px-2 rounded border text-[10px] ${selectedDiagnostics.includes(l)?"bg-[#c2183a] text-white border-[#c2183a]":""}`}>{l}</button>)}</div>
      <textarea value={investigation.notes} onChange={e=>setInvestigation({...investigation,notes:e.target.value})} placeholder="Clinical indication" className="w-full min-h-16 px-2 py-1 rounded-lg border text-xs"/>
      <button disabled={saving} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold">{saving?"Saving…":"Place imaging order"}</button>
     </form>
    )}
    {mainTab==="Orders"&&(leftNav==="Investigation Indent"||leftNav==="Procedure")&&(
     <div className="text-xs text-gray-600"><h3 className="font-semibold text-sm mb-2">{leftNav}</h3><p>Use Laboratory or Radiology left items for orders. Procedure notes can be entered under Clinical Notes.</p></div>
    )}

    {/* CLINICAL NOTES */}
    {mainTab==="Clinical Notes"&&leftNav==="Initial Assessment"&&(
     <form onSubmit={saveStructured} className="space-y-3 max-w-2xl">
      <h3 className="font-semibold text-sm">Initial Assessment</h3>
      <div className="grid md:grid-cols-2 gap-2">
       <input value={structured.dateTime} onChange={e=>setStructured({...structured,dateTime:e.target.value})} type="datetime-local" className="h-9 px-2 rounded-lg border text-xs"/>
       <input value={structured.diagnosis} onChange={e=>setStructured({...structured,diagnosis:e.target.value})} placeholder="Diagnosis" className="h-9 px-2 rounded-lg border text-xs"/>
       <textarea value={structured.hpi} onChange={e=>setStructured({...structured,hpi:e.target.value})} placeholder="History of present illness" className="min-h-16 px-2 py-1 rounded-lg border text-xs md:col-span-2"/>
       <input value={structured.allergy} onChange={e=>setStructured({...structured,allergy:e.target.value})} placeholder="Allergy" className="h-9 px-2 rounded-lg border text-xs"/>
       <input value={structured.examTime} onChange={e=>setStructured({...structured,examTime:e.target.value})} placeholder="Examination time" className="h-9 px-2 rounded-lg border text-xs"/>
       {[["cns","CNS"],["cvs","CVS"],["rs","RS"],["perAbdomen","Per abdomen"]].map(([k,l])=><input key={k} value={(structured as any)[k]} onChange={e=>setStructured({...structured,[k]:e.target.value})} placeholder={l} className="h-9 px-2 rounded-lg border text-xs"/>)}
       <textarea value={structured.assessment} onChange={e=>setStructured({...structured,assessment:e.target.value})} placeholder="Assessment / findings" className="min-h-16 px-2 py-1 rounded-lg border text-xs md:col-span-2"/>
       <input value={structured.workingDiagnosis} onChange={e=>setStructured({...structured,workingDiagnosis:e.target.value})} placeholder="Working diagnosis" className="h-9 px-2 rounded-lg border text-xs md:col-span-2"/>
       <textarea value={structured.treatmentGiven} onChange={e=>setStructured({...structured,treatmentGiven:e.target.value})} placeholder="Treatment given" className="min-h-12 px-2 py-1 rounded-lg border text-xs md:col-span-2"/>
      </div>
      <button disabled={saving} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold">{saving?"Saving…":"Save Initial Assessment"}</button>
     </form>
    )}
    {mainTab==="Clinical Notes"&&leftNav==="Progress Note"&&(
     <form onSubmit={saveProgress} className="space-y-3 max-w-2xl">
      <h3 className="font-semibold text-sm">Progress Note</h3>
      <div className="flex flex-wrap gap-1.5 mb-2">
       {["Vitals","Allergies","Problems","Diagnosis","Complaints","Medications"].map(chip=>(
        <button type="button" key={chip} onClick={()=>{
         if(chip==="Vitals")setStructured(s=>({...s,assessment:(s.assessment?s.assessment+"\n":"")+`Vitals: BP ${vitals.bp||selected.vitals?.bp||"—"} Pulse ${vitals.pulse||selected.vitals?.pulse||"—"} RR ${vitals.rr||selected.vitals?.rr||"—"} SpO₂ ${vitals.spo2||selected.vitals?.spo2||"—"}`}));
         if(chip==="Allergies")setStructured(s=>({...s,assessment:(s.assessment?s.assessment+"\n":"")+`Allergy: ${selected.allergies||"NKA"}`}));
         if(chip==="Diagnosis")setStructured(s=>({...s,assessment:(s.assessment?s.assessment+"\n":"")+`Dx: ${selected.diagnosis||selected.workingDiagnosis||"—"} ${selected.icdCode||""}`}));
         if(chip==="Complaints")setStructured(s=>({...s,assessment:(s.assessment?s.assessment+"\n":"")+`Chief complaint: ${selected.chiefComplaint||"—"}`}));
        }} className="h-7 px-2 rounded-full border text-[10px] bg-slate-50 hover:bg-slate-100">{chip}</button>
       ))}
      </div>
      <textarea value={structured.assessment} onChange={e=>setStructured({...structured,assessment:e.target.value})} placeholder="Assessment" className="w-full min-h-20 px-2 py-1 rounded-lg border text-xs"/>
      <textarea value={structured.treatmentGiven} onChange={e=>setStructured({...structured,treatmentGiven:e.target.value})} placeholder="Current meds / treatment" className="w-full min-h-16 px-2 py-1 rounded-lg border text-xs"/>
      <textarea value={structured.course} onChange={e=>setStructured({...structured,course:e.target.value})} placeholder="Plan / course" className="w-full min-h-16 px-2 py-1 rounded-lg border text-xs"/>
      <textarea value={structured.dischargeTreatment} onChange={e=>setStructured({...structured,dischargeTreatment:e.target.value})} placeholder="Advice" className="w-full min-h-12 px-2 py-1 rounded-lg border text-xs"/>
      <button disabled={saving} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold">{saving?"Saving…":"Save Progress Note"}</button>
     </form>
    )}
    {mainTab==="Clinical Notes"&&["Consultant Note","RMO Note","Nursing Care Note","Case Summary"].includes(leftNav)&&(
     <form onSubmit={(e)=>{setNote({...note,noteType:leftNav});void saveNote(e)}} className="space-y-3 max-w-2xl">
      <h3 className="font-semibold text-sm">{leftNav}</h3>
      <textarea value={note.content} onChange={e=>setNote({...note,content:e.target.value,noteType:leftNav})} placeholder={`Enter ${leftNav}…`} className="w-full min-h-40 px-2 py-1 rounded-lg border text-xs"/>
      <button disabled={saving} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold">{saving?"Saving…":`Save ${leftNav}`}</button>
      <div className="mt-4 space-y-2 max-h-64 overflow-auto">
       {clinicalNotes.filter((n:any)=>(n.noteType||"").includes(leftNav.split(" ")[0])||leftNav==="Case Summary").map((n:any,i:number)=>(
        <div key={i} className="border rounded-lg p-2"><p className="font-medium text-[11px]">{n.noteType} · {n.authorName||n.authorRole||""}</p><p className="text-[10px] text-gray-500">{n.createdAt?new Date(n.createdAt).toLocaleString("en-IN"):""}</p><pre className="whitespace-pre-wrap font-sans text-[11px] mt-1">{n.content}</pre></div>
       ))}
      </div>
     </form>
    )}

    {/* DISCHARGE */}
    {mainTab==="Discharge Summary"&&(
     <form onSubmit={(e)=>{setNote({...note,noteType:leftNav});void saveNote(e)}} className="space-y-3 max-w-2xl">
      <h3 className="font-semibold text-sm">{leftNav}</h3>
      <textarea value={note.content} onChange={e=>setNote({...note,content:e.target.value,noteType:leftNav})} placeholder={`Enter ${leftNav}…`} className="w-full min-h-48 px-2 py-1 rounded-lg border text-xs"/>
      <button disabled={saving} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold">{saving?"Saving…":`Save ${leftNav}`}</button>
     </form>
    )}

    {/* LAB */}
    {mainTab==="Lab"&&leftNav==="Lab Orders"&&(
     <div><h3 className="font-semibold text-sm mb-2">Lab Orders</h3>
      <div className="space-y-2">{labOrders.length?labOrders.map((o:any,i:number)=><div key={i} className="border rounded-lg p-2"><p className="font-medium">{o.testName||o.name}</p><p className="text-[10px] text-gray-500">{o.status||"Ordered"} · {o.orderedAt?new Date(o.orderedAt).toLocaleString("en-IN"):""}</p></div>):<p className="text-gray-500">No lab orders yet. Use Orders → Laboratory.</p>}</div>
      <button type="button" onClick={()=>{setMainTab("Orders");setLeftNav("Laboratory")}} className="mt-3 h-8 px-3 rounded border text-xs text-[#c2183a]">+ New lab order</button>
     </div>
    )}
    {mainTab==="Lab"&&leftNav==="Lab Results"&&(
     <div><h3 className="font-semibold text-sm mb-2">Lab Results</h3>
      <div className="space-y-2">{labOrders.filter((o:any)=>o.result||o.status==="COMPLETED"||o.status==="RESULTED").length?labOrders.filter((o:any)=>o.result||o.status==="COMPLETED"||o.status==="RESULTED").map((o:any,i:number)=><div key={i} className="border rounded-lg p-2"><p className="font-medium">{o.testName||o.name}</p><pre className="whitespace-pre-wrap font-sans text-[11px] mt-1 bg-gray-50 p-2 rounded">{o.result||"Result available"}</pre></div>):<p className="text-gray-500">No lab results yet.</p>}</div>
     </div>
    )}

    {/* RADIOLOGY */}
    {mainTab==="Radiology"&&leftNav==="Imaging Orders"&&(
     <div><h3 className="font-semibold text-sm mb-2">Imaging Orders</h3>
      <div className="space-y-2">{radOrders.length?radOrders.map((o:any,i:number)=><div key={i} className="border rounded-lg p-2"><p className="font-medium">{o.testName||o.name}</p><p className="text-[10px] text-gray-500">{o.status||"Ordered"}</p></div>):<p className="text-gray-500">No imaging orders yet. Use Orders → Radiology.</p>}</div>
      <button type="button" onClick={()=>{setMainTab("Orders");setLeftNav("Radiology")}} className="mt-3 h-8 px-3 rounded border text-xs text-[#c2183a]">+ New imaging order</button>
     </div>
    )}
    {mainTab==="Radiology"&&leftNav==="Imaging Results"&&(
     <div><h3 className="font-semibold text-sm mb-2">Imaging Results</h3>
      <div className="space-y-2">{radOrders.filter((o:any)=>o.result).length?radOrders.filter((o:any)=>o.result).map((o:any,i:number)=><div key={i} className="border rounded-lg p-2"><p className="font-medium">{o.testName||o.name}</p><pre className="whitespace-pre-wrap font-sans text-[11px] mt-1 bg-gray-50 p-2 rounded">{o.result}</pre></div>):<p className="text-gray-500">No imaging results yet.</p>}</div>
     </div>
    )}

    {/* MAR */}
    {mainTab==="MAR"&&selected&&(
     <div><h3 className="font-semibold text-sm mb-3">Medication Administration Record</h3><MedicationAdministrationPanel patient={selected} /></div>
    )}

   </div>
  </div>
  </>)}

  {/* Modals */}
  {showRegister&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={register} className="bg-white rounded-xl max-w-2xl w-full p-4 space-y-2 max-h-[90vh] overflow-auto"><h3 className="font-semibold">Register patient</h3>
   <div className="grid grid-cols-2 gap-2 text-xs">
    <input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Name" className="h-9 px-2 rounded-lg border"/><input value={form.age} onChange={e=>setForm({...form,age:e.target.value})} placeholder="Age" className="h-9 px-2 rounded-lg border"/>
    <select value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})} className="h-9 px-2 rounded-lg border"><option>Male</option><option>Female</option><option>Other</option></select>
    <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="Phone" className="h-9 px-2 rounded-lg border"/>
    <input value={form.allergies} onChange={e=>setForm({...form,allergies:e.target.value})} placeholder="Allergies" className="h-9 px-2 rounded-lg border col-span-2"/>
    <select value={form.wardType} onChange={e=>setForm({...form,wardType:e.target.value})} className="h-9 px-2 rounded-lg border">{[...WARDS,...ICUS].map(w=><option key={w}>{w}</option>)}</select>
    <input value={form.roomNumber} onChange={e=>setForm({...form,roomNumber:e.target.value})} placeholder="Bed / room" className="h-9 px-2 rounded-lg border"/>
    <textarea value={form.chiefComplaint} onChange={e=>setForm({...form,chiefComplaint:e.target.value})} placeholder="Chief complaint" className="min-h-10 px-2 py-1 rounded-lg border col-span-2"/>
    <input value={form.workingDiagnosis} onChange={e=>setForm({...form,workingDiagnosis:e.target.value})} placeholder="Working diagnosis" className="h-9 px-2 rounded-lg border"/><input value={form.icdCode} onChange={e=>setForm({...form,icdCode:e.target.value})} placeholder="ICD code" className="h-9 px-2 rounded-lg border"/>
    <input value={form.consultantName} onChange={e=>setForm({...form,consultantName:e.target.value})} placeholder="Consultant" className="h-9 px-2 rounded-lg border"/><input value={form.consultantSpecialty} onChange={e=>setForm({...form,consultantSpecialty:e.target.value})} placeholder="Specialty" className="h-9 px-2 rounded-lg border"/>
   </div>
   <div className="flex gap-2 justify-end"><button type="button" onClick={()=>setShowRegister(false)} className="h-9 px-3 rounded-lg border text-xs">Cancel</button><button disabled={saving} className="h-9 px-3 rounded-lg bg-[#c2183a] text-white text-xs">{saving?"Saving…":"Register"}</button></div>
  </form></div>}

  {showRoom&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={addRoom} className="bg-white rounded-xl max-w-sm w-full p-4 space-y-2"><h3 className="font-semibold">Add room</h3>
   <input required value={room.roomNumber} onChange={e=>setRoom({...room,roomNumber:e.target.value})} placeholder="Room number" className="w-full h-9 px-2 rounded-lg border text-xs"/>
   <select value={room.roomCategory} onChange={e=>setRoom({...room,roomCategory:e.target.value})} className="w-full h-9 px-2 rounded-lg border text-xs">{[...WARDS,...ICUS].map(w=><option key={w}>{w}</option>)}</select>
   <div className="flex gap-2 justify-end"><button type="button" onClick={()=>setShowRoom(false)} className="h-9 px-3 rounded-lg border text-xs">Cancel</button><button disabled={saving} className="h-9 px-3 rounded-lg bg-[#140a1f] text-white text-xs">Add</button></div>
  </form></div>}

  {showTransfer&&selected&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={transferPatient} className="bg-white rounded-xl max-w-sm w-full p-4 space-y-2"><h3 className="font-semibold">Transfer bed</h3>
   <select required value={transferRoom} onChange={e=>setTransferRoom(e.target.value)} className="w-full h-9 px-2 rounded-lg border text-xs"><option value="">Select destination room</option>{rooms.filter((r:any)=>!r.occupied||r.roomNumber===selected.roomNumber).map((r:any)=><option key={r.id} value={r.roomNumber}>Room {r.roomNumber} · {r.roomCategory}</option>)}</select>
   <div className="flex gap-2 justify-end"><button type="button" onClick={()=>setShowTransfer(false)} className="h-9 px-3 rounded-lg border text-xs">Cancel</button><button disabled={saving} className="h-9 px-3 rounded-lg bg-[#140a1f] text-white text-xs">Confirm transfer</button></div>
  </form></div>}

  {showHandover&&selected&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={doHandover} className="bg-white rounded-xl max-w-sm w-full p-4 space-y-2"><h3 className="font-semibold">Clinical handover</h3>
   <select required value={handover.receivingMemberId} onChange={e=>setHandover({...handover,receivingMemberId:e.target.value})} className="w-full h-9 px-2 rounded-lg border text-xs"><option value="">Select receiving clinician</option>{handoverOptions.map((o:any)=><option key={o.id} value={o.id}>{o.name||o.email}</option>)}</select>
   <textarea value={handover.context} onChange={e=>setHandover({...handover,context:e.target.value})} placeholder="Handover context" className="w-full min-h-16 px-2 py-1 rounded-lg border text-xs"/>
   <div className="flex gap-2 justify-end"><button type="button" onClick={()=>setShowHandover(false)} className="h-9 px-3 rounded-lg border text-xs">Cancel</button><button disabled={saving} className="h-9 px-3 rounded-lg bg-[#140a1f] text-white text-xs">Confirm handover</button></div>
  </form></div>}

 </div></AppShell>;
}
