"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { EXPANDED_LAB_CATALOG, EXPANDED_RADIOLOGY_CATALOG } from "@/lib/diagnostic-catalog";
import MedicationAdministrationPanel from "@/components/ipd/MedicationAdministrationPanel";
import MedOrderPanel from "@/components/ipd/MedOrderPanel";

const WARDS=["General Ward","Twin Sharing","Single Sharing","Deluxe Ward","Super Deluxe"];
const ICUS=["ICU","MICU","SICU","Transplant ICU","PICU","NICU"];
const NOTE_TYPES=["Transfer Summary","Discharge Summary","Pharmacy Summary","Death Summary","DAMA Summary","LAMA Summary","Fitness Note","Case Summary"];
const DIAGNOSTICS=["Chest X-ray","Abdominal X-ray","Ultrasound Abdomen","Ultrasound Pelvis","CT Head","CT Chest","CT Abdomen/Pelvis","MRI Brain","MRI Spine","2D Echo","ECG","Holter","TMT","Doppler Study","Mammography","PET-CT","Endoscopy","Colonoscopy","Bronchoscopy","Other Diagnostic"];
const DEPARTMENTS=["General Medicine","General Surgery","Gastroenterology","GI Surgery / Surgical Gastroenterology","Cardiology","Cardiothoracic & Vascular Surgery (CTVS)","Neurology","Neurosurgery","Nephrology & Dialysis","Urology","Orthopaedics","Obstetrics & Gynaecology","Paediatrics","Paediatric Surgery","Neonatology","ENT","Ophthalmology","Dermatology & Venereology","Pulmonary / Respiratory Medicine","Critical Care Medicine","Emergency Medicine & Trauma","Endocrinology","Rheumatology","Clinical Haematology","Medical Oncology","Surgical Oncology","Radiation Oncology","Plastic & Reconstructive Surgery","Anaesthesiology","Physical Medicine & Rehabilitation","Psychiatry & Mental Health","Nuclear Medicine","Radiology / Interventional Radiology","Palliative Care","Dental","Other"];

/** CPRS top tabs — only one main panel visible at a time */
const MAIN_TABS=["Cover Sheet","Dashboard","Orders","Clinical Notes","Discharge Summary","MAR"] as const;
type MainTab=typeof MAIN_TABS[number];

/** Left nav items depend on main tab (CPRS pattern) */
const LEFT_NAV:Record<MainTab,string[]>={
  "Cover Sheet":["Overview"],
  "Dashboard":["Vitals","Problems","Final Diagnosis","Chief-Complaints","Allergies","OPD/IPD Details"],
  "Orders":["Order Medicines","Laboratory","Radiology","Procedure"],
  "Clinical Notes":["Note View","Initial Assessment","Progress Note","Consultant Note","RMO Note","Nursing Care Note","Case Summary"],
  "Discharge Summary":["Transfer Summary","Discharge Summary","Pharmacy Summary","Death Summary","DAMA Summary","LAMA Summary","Fitness Note","Case Summary"],
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
 const[labSearch,setLabSearch]=useState(""),[diagnosticSearch,setDiagnosticSearch]=useState(""),[coverNoteType,setCoverNoteType]=useState("Discharge Summary");
 const[insuranceProviders,setInsuranceProviders]=useState<any[]>([]),[patientPolicies,setPatientPolicies]=useState<any[]>([]),[patientInvoices,setPatientInvoices]=useState<any[]>([]);
 const[adminPathway,setAdminPathway]=useState("Self-pay / Cash");
 const[adminForm,setAdminForm]=useState({providerId:"",policyNumber:"",memberId:"",preauthNumber:"",claimNumber:"",requestedAmount:"",esicIpNumber:"",esicBeneficiaryNumber:"",esicAuthorizationNumber:"",esicPackageCode:"",administrativeNotes:""});
 const[adminStatus,setAdminStatus]=useState("");
 const[dxForm,setDxForm]=useState({workingDiagnosis:"",diagnosis:"",icdCode:""});
 const[noteViewId,setNoteViewId]=useState<string|null>(null);
 const[sectionPull,setSectionPull]=useState<Record<string,boolean>>({vitals:false,allergies:false,problems:false,diagnosis:false,complaints:false,medications:false,laboratory:false,radiology:false,clinicalNotes:false,orders:false,medicationAdvice:false});
 const[dischargeForm,setDischargeForm]=useState({
  dischargeDateTime:"",diagnosis:"",presentingComplaints:"",hpi:"",pastMedicalHistory:"",currentMedication:"",
  personalHistory:"",familyHistory:"",allergies:"",occupationalHistory:"",onExamination:"",courseInHospital:"",
  procedure:"",surgery:"",findings:"",conditionOnDischarge:"",tpaPatient:"",investigation:"",medicationsDuringStay:"",
  advice:"",specialNeeds:"",followUpAdvice:"",ack:false
 });
 const[error,setError]=useState(""),[msg,setMsg]=useState(""),[saving,setSaving]=useState(false),[showTransfer,setShowTransfer]=useState(false),[transferRoom,setTransferRoom]=useState("");

 const load=useCallback(async()=>{const r=await fetch("/api/ipd",{credentials:"include",cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Could not load IPD workspace (${r.status})`);const ps=d.patients||[];setPatients(ps);setHistory(d.ipdHistory||[]);setRooms(d.rooms||[]);setHandoverOptions(d.handoverOptions||[]);if(d.currentRole)setCurrentRole(d.currentRole);if(d.currentDepartment)setDepartment(d.currentDepartment);const fresh=[...ps,...(d.ipdHistory||[])].find((p:any)=>p.id===patientId);if(fresh){setSelected(fresh);if(fresh.department)setDepartment(fresh.department);if(fresh.workingDiagnosis||fresh.diagnosis||fresh.icdCode)setDxForm({workingDiagnosis:fresh.workingDiagnosis||"",diagnosis:fresh.diagnosis||"",icdCode:fresh.icdCode||""});}},[patientId]);
 useEffect(()=>{if(!authLoading&&doctor)load().catch(e=>setError(e.message))},[authLoading,doctor,load]);
 useEffect(()=>{if(!doctor||!selected?.id)return;(async()=>{try{const [ir,vr]=await Promise.all([fetch("/api/insurance",{credentials:"include",cache:"no-store"}),fetch("/api/invoices",{credentials:"include",cache:"no-store"})]);const ins=await ir.json().catch(()=>({}));const inv=await vr.json().catch(()=>({}));if(ir.ok){setInsuranceProviders(ins.providers||[]);setPatientPolicies((ins.policies||[]).filter((p:any)=>p.patientId===selected.id));}if(vr.ok)setPatientInvoices((inv.invoices||[]).filter((i:any)=>i.patientId===selected.id));}catch(e){console.error("administrative discharge load",e)}})()},[doctor,selected?.id]);
 useEffect(()=>{const items=LEFT_NAV[mainTab]||["Overview"];if(!items.includes(leftNav))setLeftNav(items[0]);},[mainTab,leftNav]);

 const post=async(body:any)=>{const r=await fetch("/api/ipd",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok||d.success!==true)throw new Error(d.error||`Could not save IPD record (${r.status})`);return d};
 const run=async(body:any,success:string)=>{setSaving(true);setError("");setMsg("");try{await post(body);try{await load()}catch(e:any){setError(e.message||"Saved, but the IPD workspace could not be refreshed.");return true}setMsg(success);return true}catch(e:any){setMsg("");setError(e.message||"Could not save IPD record");return false}finally{setSaving(false)}};

 const saveStructured=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;const x=structured;const content=`Date & time: ${x.dateTime}\nDiagnosis: ${x.diagnosis}\nHistory of present illness: ${x.hpi}\nAllergy: ${x.allergy}\nExamination time: ${x.examTime}\nVitals: BP ${vitals.bp} | Pulse ${vitals.pulse} | RR ${vitals.rr} | SpO₂ ${vitals.spo2} | Temperature ${vitals.temperature}\nAssessment — CNS: ${x.cns}\nAssessment — CVS: ${x.cvs}\nAssessment — Respiratory system: ${x.rs}\nAssessment — Per abdomen: ${x.perAbdomen}\nAssessment / findings: ${x.assessment}\nWorking diagnosis: ${x.workingDiagnosis}\nTreatment given: ${x.treatmentGiven}\nCourse during admission: ${x.course}\nProcedures performed: ${x.procedures}\nInvestigations advised / results: ${x.investigations}\nTreatment on discharge: ${x.dischargeTreatment}\nFollow-up date/time: ${x.followUpDate}\nFollow-up consultant: ${x.followUpConsultant || selected.consultantName || ""}`;if(!(await run({action:"clinical-note",patientId:selected.id,noteType:"Initial Assessment",title:department+" · Initial Assessment",content,authorRole:`${doctor?.name||"Logged-in clinician"} · Initial Assessment`,allergy:x.allergy,vitals},`Initial Assessment saved to IPD history`)))return;setStructured({...structured,dateTime:new Date().toISOString().slice(0,16)})};
 const saveNote=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;await run({action:"clinical-note",patientId:selected.id,noteType:note.noteType,title:`${department} · ${note.noteType}`,content:note.content,authorRole:`${doctor?.name||"Clinician"} · ${note.noteType}`},`${note.noteType} saved`)};
 const saveProgress=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;const content=`Progress Note\nAssessment: ${structured.assessment}\nCurrent meds / treatment: ${structured.treatmentGiven}\nPlan / course: ${structured.course}\nAdvice: ${structured.dischargeTreatment}\nVitals: BP ${vitals.bp} | Pulse ${vitals.pulse} | RR ${vitals.rr} | SpO₂ ${vitals.spo2} | Temp ${vitals.temperature}\nAllergy: ${selected.allergies||"NKA"}\nDiagnosis: ${selected.diagnosis||selected.workingDiagnosis||"—"}`;await run({action:"clinical-note",patientId:selected.id,noteType:"Progress Note",title:`${department} · Progress Note`,content,authorRole:`${doctor?.name||"Clinician"} · Progress Note`,vitals},`Progress Note saved`)};
 const saveDiagnosis=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;await run({action:"update-diagnosis",patientId:selected.id,...dxForm},`Diagnosis / ICD saved`)};
 const pullCompleteChart=()=>{if(!selected)return;const labs=selected.labOrders||selected.investigationOrders||[];const rads=selected.diagnosticOrders||[];const encounters=selected.encounterSummaries||[];const notes=(selected.clinicalNotes||[]).slice().sort((a:any,b:any)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());const prescriptions=selected.prescriptionSummaries||[];const latest=encounters[encounters.length-1];const initial=notes.filter((n:any)=>/Initial Assessment/i.test(n.noteType||"")).map((n:any)=>n.content||"").join("\n\n");const summaries=notes.filter((n:any)=>/Case Summary|Consultant Note|Progress Note|RMO Note|Nursing Care Note|Transfer Summary/i.test(n.noteType||"")).map((n:any)=>"["+String(n.noteType||"Clinical Note")+"] "+String(n.content||"")).join("\n\n");const labText=labs.map((o:any)=>String(o.testName||"Laboratory")+" — "+String(o.status||"Ordered")+(o.result?" — Result: "+o.result:"")).join("\n");const radText=rads.map((o:any)=>String(o.studyName||"Diagnostic")+" · "+String(o.modality||"")+" — "+String(o.status||"Ordered")+(o.findings?" — Findings: "+o.findings:"")+(o.impression?" — Impression: "+o.impression:"")).join("\n");const meds=prescriptions.map((p:any)=>p.medicines).filter(Boolean).join("\n");const advice=prescriptions.map((p:any)=>p.advice).filter(Boolean).join("\n");setDischargeForm(d=>({...d,diagnosis:d.diagnosis||selected.diagnosis||selected.workingDiagnosis||latest?.diagnosis||"",presentingComplaints:d.presentingComplaints||selected.chiefComplaint||latest?.chiefComplaint||"",hpi:d.hpi||initial.match(/History of present illness:\s*([^\n]+)/i)?.[1]||"",allergies:d.allergies||selected.allergies||"NKA",courseInHospital:d.courseInHospital||summaries||initial,investigation:[labText,radText].filter(Boolean).join("\n")||d.investigation,medicationsDuringStay:d.medicationsDuringStay||meds,currentMedication:d.currentMedication||meds,findings:d.findings||rads.map((o:any)=>o.findings||o.impression).filter(Boolean).join("\n")||"",advice:d.advice||advice||""}));setSectionPull({vitals:true,allergies:true,problems:true,diagnosis:true,complaints:true,medications:true,laboratory:true,radiology:true,clinicalNotes:true,orders:true,medicationAdvice:true});setMsg("Pulled "+notes.length+" clinical notes, "+labs.length+" laboratory investigations, "+rads.length+" diagnostics and "+prescriptions.length+" medication records from the chart.");};
 const saveDischargeStructured=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;const d=dischargeForm;
  const pulled=[];
  if(sectionPull.vitals)pulled.push(`Vitals: BP ${vitals.bp||selected.vitals?.bp||"—"} | Pulse ${vitals.pulse||selected.vitals?.pulse||"—"} | RR ${vitals.rr||selected.vitals?.rr||"—"} | SpO₂ ${vitals.spo2||selected.vitals?.spo2||"—"}`);
  if(sectionPull.allergies)pulled.push(`Allergies: ${d.allergies||selected.allergies||"NKA"}`);
  if(sectionPull.diagnosis)pulled.push(`Diagnosis: ${d.diagnosis||selected.diagnosis||selected.workingDiagnosis||"—"}`);
  if(sectionPull.complaints)pulled.push(`Presenting complaints: ${d.presentingComplaints||selected.chiefComplaint||"—"}`);
  if(sectionPull.medications){const meds=Array.isArray(selected.medicationOrders)?selected.medicationOrders.map((o:any)=>o.name||o.medicine||o.medication||"Medication").join("\n"):d.currentMedication||"—";pulled.push(`Medication Orders:\n${meds}`);}
  if(sectionPull.laboratory){const labs=(labOrders||[]).map((o:any)=>`${o.testName||o.name||"Laboratory"} — ${o.status||"Ordered"}${o.result?` — Result: ${o.result}`:""}`).join("\n");pulled.push(`Laboratory:\n${labs||d.investigation||"—"}`);}
  if(sectionPull.radiology){const rads=(radOrders||[]).map((o:any)=>`${o.testName||o.name||"Diagnostic"} — ${o.status||"Ordered"}${o.result?` — Result: ${o.result}`:""}`).join("\n");pulled.push(`Radiology / Diagnostics:\n${rads||"—"}`);}
  if(sectionPull.clinicalNotes){const notes=(clinicalNotes||[]).slice(0,12).map((n:any)=>`[${n.noteType||n.title||"Clinical Note"}] ${n.content||""}`).join("\n\n");pulled.push(`Previous Clinical Notes:\n${notes||"—"}`);}
  if(sectionPull.orders){const orders=[...(labOrders||[]),...(radOrders||[])].map((o:any)=>`${o.testName||o.name||"Order"} — ${o.status||"Ordered"}`).join("\n");pulled.push(`Chart Orders:\n${orders||"—"}`);}
  const adminLine=adminPathway+" | "+(adminPathway==="Insurance / TPA" ? "Provider: "+(insuranceProviders.find((p:any)=>p.id===adminForm.providerId)?.name||"—")+" | Policy: "+adminForm.policyNumber+" | Member: "+adminForm.memberId+" | Preauth: "+adminForm.preauthNumber+" | Claim: "+adminForm.claimNumber+" | Requested: ₹"+adminForm.requestedAmount : adminPathway==="ESIC" ? "IP: "+adminForm.esicIpNumber+" | Beneficiary: "+adminForm.esicBeneficiaryNumber+" | Authorization: "+adminForm.esicAuthorizationNumber+" | Package: "+adminForm.esicPackageCode : adminForm.administrativeNotes); const content=[adminLine,`Date and Time of Discharge: ${d.dischargeDateTime||"—"}`,`Diagnosis: ${d.diagnosis}`,`Presenting Complaints: ${d.presentingComplaints}`,`History of Present Illness: ${d.hpi}`,`Past Medical History: ${d.pastMedicalHistory}`,`Current Medication: ${d.currentMedication}`,`Personal History: ${d.personalHistory}`,`Family History: ${d.familyHistory}`,`Allergies: ${d.allergies||selected.allergies||"NKA"}`,`Occupational History: ${d.occupationalHistory}`,`On Examination: ${d.onExamination}`,`Course In Hospital: ${d.courseInHospital}`,`Procedure: ${d.procedure}`,`Surgery: ${d.surgery}`,`Findings: ${d.findings}`,`Condition on Discharge: ${d.conditionOnDischarge}`,`Investigation: ${d.investigation}`,`Medications During Stay: ${d.medicationsDuringStay}`,`Advice: ${d.advice}`,`Special Needs: ${d.specialNeeds}`,`Follow Up Advice: ${d.followUpAdvice}`,pulled.length?`\n— Pulled sections —\n`+pulled.join("\n"):"",d.ack?"Patient/Attendant acknowledgement recorded.":""].filter(Boolean).join("\n");
  await run({action:"clinical-note",patientId:selected.id,noteType:coverNoteType,title:`${department} · ${coverNoteType}`,content,authorRole:`${doctor?.name||"Clinician"} · ${coverNoteType}`},`${coverNoteType} saved`);
 };
 const finalizeDischarge=async()=>{if(!selected||saving)return;if(!window.confirm("Finalize the Discharge Summary and discharge this patient from the active IPD census? The UHID and complete clinical history will be retained."))return;const d=dischargeForm;const adminLine=adminPathway+" | "+(adminPathway==="Insurance / TPA" ? "Provider: "+(insuranceProviders.find((p:any)=>p.id===adminForm.providerId)?.name||"—")+" | Policy: "+adminForm.policyNumber+" | Member: "+adminForm.memberId+" | Preauth: "+adminForm.preauthNumber+" | Claim: "+adminForm.claimNumber+" | Requested: ₹"+adminForm.requestedAmount : adminPathway==="ESIC" ? "IP: "+adminForm.esicIpNumber+" | Beneficiary: "+adminForm.esicBeneficiaryNumber+" | Authorization: "+adminForm.esicAuthorizationNumber+" | Package: "+adminForm.esicPackageCode : adminForm.administrativeNotes);const content=adminLine+"\nDate and Time of Discharge: "+(d.dischargeDateTime||"—")+"\nDiagnosis: "+d.diagnosis+"\nPresenting Complaints: "+d.presentingComplaints+"\nHistory of Present Illness: "+d.hpi+"\nPast Medical History: "+d.pastMedicalHistory+"\nCurrent Medication: "+d.currentMedication+"\nCourse In Hospital: "+d.courseInHospital+"\nProcedure: "+d.procedure+"\nSurgery: "+d.surgery+"\nFindings: "+d.findings+"\nCondition on Discharge: "+d.conditionOnDischarge+"\nInvestigation: "+d.investigation+"\nMedications During Stay: "+d.medicationsDuringStay+"\nAdvice: "+d.advice+"\nFollow Up Advice: "+d.followUpAdvice;const ok=await run({action:"clinical-note",patientId:selected.id,noteType:"Discharge Summary",title:department+" · Discharge Summary",content,authorRole:(doctor?.name||"Clinician")+" · Discharge Summary"},"Final Discharge Summary saved");if(!ok)return;const r=await fetch("/api/patients/lifecycle",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({patientId:selected.id,action:"discharge",reason:"Final Discharge Summary completed"})});const x=await r.json().catch(()=>({}));if(!r.ok||!x.success){setError(x.error||"Could not discharge patient");return;}setMsg(selected.name+" discharged successfully. The active IPD admission is closed; UHID/history is retained.");await load();};
 const saveVitals=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;if(!(await run({action:"vitals",patientId:selected.id,vitals},`Vitals saved`)))return;};
 const orderLabs=async(e:React.FormEvent)=>{e.preventDefault();if(!selected||!selectedLabs.length)return;if(!(await run({action:"lab-order",patientId:selected.id,tests:selectedLabs,notes:investigation.notes},`Lab order placed`)))return;setSelectedLabs([])};
 const orderRad=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;const tests=selectedDiagnostics.length?selectedDiagnostics:[diagnosticType];await run({action:"diagnostic-order",patientId:selected.id,tests,notes:investigation.notes},`Imaging order placed`);setSelectedDiagnostics([])};
 const register=async(e:React.FormEvent)=>{e.preventDefault();if(!(await run({action:"register",...form},`${form.careSetting} patient registered`)))return;setShowRegister(false);setForm(empty)};
 const addRoom=async(e:React.FormEvent)=>{e.preventDefault();if(!(await run({action:"add-room",...room},`Room ${room.roomNumber} added`)))return;setShowRoom(false);setRoom({roomNumber:"",roomCategory:"General Ward",unitType:"Ward"})};
 const transferPatient=async(e:React.FormEvent)=>{e.preventDefault();if(!selected||!transferRoom)return;setSaving(true);try{const r=await post({action:"room-transfer",patientId:selected.id,roomNumber:transferRoom});setMsg(r.success?`Patient transferred to room / bed ${transferRoom}.`:"Transfer completed.");setShowTransfer(false);setTransferRoom("");await load()}catch(e:any){setError(e.message||"Could not transfer patient")}finally{setSaving(false)}};
 const doHandover=async(e:React.FormEvent)=>{e.preventDefault();if(!selected||!handover.receivingMemberId)return;if(!window.confirm("Transfer clinical responsibility for this IPD patient to the selected receiving clinician/team?"))return;setSaving(true);try{const r=await post({action:"handover",patientId:selected.id,receivingMemberId:handover.receivingMemberId,context:handover.context.trim()});setMsg(r.success?"Clinical responsibility handed over.":"Handover completed.");setShowHandover(false);setHandover({receivingMemberId:"",context:""});await load()}catch(e:any){setError(e.message||"Could not complete handover")}finally{setSaving(false)}};

 if(authLoading)return <AppShell><div className="p-6 text-sm text-gray-500">Loading…</div></AppShell>;
 if(!doctor)return <AppShell><div className="p-6 text-sm text-gray-500">Sign in to open the IPD clinical workspace.</div></AppShell>;

 if(!clinicalMode)return <AppShell><div className="p-4"><Link href="/ipd" className="text-xs text-[#c2183a] font-medium">← Back to IPD census</Link>{selected?<div className="mt-4 max-w-3xl bg-white rounded-xl border shadow-sm p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-semibold">{selected.name}</p><p className="text-xs text-gray-500">{selected.age} yrs · {selected.gender} · {selected.wardType||"Ward"} · Bed {selected.roomNumber||"Unassigned"}</p><p className="text-[11px] text-gray-500 mt-1">UHID: {selected.uhid||"—"} · MedLum ID: {selected.medlumId||"—"}</p><p className="text-[11px] text-gray-500">Admission: {selected.admissionDate?new Date(selected.admissionDate).toLocaleDateString("en-IN"):"—"}</p></div><span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${selected.status==="DISCHARGED"?"bg-gray-100 text-gray-600":"bg-purple-50 text-purple-700"}`}>{selected.status==="DISCHARGED"?"DISCHARGED":"IPD"}</span></div><div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2"><div className="border rounded-lg p-2"><p className="text-[10px] text-gray-500">BP</p><p className="font-semibold text-sm">{selected.vitals?.bp||"—"}</p></div><div className="border rounded-lg p-2"><p className="text-[10px] text-gray-500">Pulse</p><p className="font-semibold text-sm">{selected.vitals?.pulse||"—"}</p></div><div className="border rounded-lg p-2"><p className="text-[10px] text-gray-500">SpO₂</p><p className="font-semibold text-sm">{selected.vitals?.spo2||"—"}</p></div><div className="border rounded-lg p-2"><p className="text-[10px] text-gray-500">RR</p><p className="font-semibold text-sm">{selected.vitals?.rr||"—"}</p></div><div className="border rounded-lg p-2"><p className="text-[10px] text-gray-500">Allergy</p><p className="font-semibold text-sm text-red-700">{selected.allergies||"No known allergy recorded"}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/ipd/${selected.id}/clinical`} className="h-9 px-4 rounded-lg bg-[#140a1f] text-white text-xs font-semibold inline-flex items-center">Open Clinical Workspace</Link><span className="text-[10px] text-gray-500 self-center">Patient record & notes live inside the clinical workspace</span></div></div>:<div className="mt-4 bg-white rounded-xl border p-6 text-sm text-gray-500">IPD patient could not be found.</div>}</div></AppShell>;

 const labOrders=selected?.labOrders||selected?.investigationOrders||[];
 const radOrders=selected?.diagnosticOrders||[];
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
     <button key={item} type="button" onClick={()=>{setLeftNav(item);if(mainTab==="Discharge Summary")setCoverNoteType(item)}}
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
       <button type="button" onClick={()=>setShowHandover(true)} className="h-8 px-3 rounded border text-xs" title="Transfer / Handover Patient">Clinical handover</button>
      </div>
     </div>
    )}

    {/* ORDERS — all investigations live here */}
    {mainTab==="Orders"&&leftNav==="Order Medicines"&&selected&&(
     <div className="space-y-4"><div><h3 className="font-semibold text-sm mb-3">Order Medicines</h3><MedOrderPanel patient={{ id: selected.id, name: selected.name }} /></div>
      <div className="rounded-lg border bg-gray-50 p-3"><h4 className="text-xs font-semibold mb-2">Medication Indent History</h4>{(selected.clinicalNotes||[]).filter((n:any)=>n.noteType==="Medication Indent").length?<div className="space-y-2">{(selected.clinicalNotes||[]).filter((n:any)=>n.noteType==="Medication Indent").slice(0,10).map((n:any)=><div key={n.id||n.createdAt} className="rounded border bg-white p-2 text-[10px]"><div className="font-medium">{n.title||"Medication Indent"}</div><pre className="whitespace-pre-wrap font-sans mt-1">{n.content||""}</pre></div>)}</div>:<p className="text-[10px] text-gray-500">No medication indents recorded yet.</p>}</div>
     </div>
    )}
    {mainTab==="Orders"&&leftNav==="Laboratory"&&(
     <form onSubmit={orderLabs} className="space-y-3 max-w-3xl">
      <h3 className="font-semibold text-sm">Laboratory Orders</h3>
      <p className="text-[10px] text-gray-500">Search the full MedLum laboratory catalogue and add investigations directly.</p>
      <div className="relative">
       <input value={labSearch} onChange={e=>setLabSearch(e.target.value)} placeholder="Type CBC, dengue, malaria, LFT, culture, hormone…" className="w-full h-10 px-3 rounded-lg border bg-gray-50 text-sm" />
       {labSearch.trim()&&<div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-lg border bg-white shadow-lg">{EXPANDED_LAB_CATALOG.filter(x=>{const q=labSearch.trim().toLowerCase();return x.name.toLowerCase().includes(q)||x.category.toLowerCase().includes(q)}).slice(0,40).map(x=><button type="button" key={x.id} onClick={()=>{setSelectedLabs(s=>s.includes(x.name)?s:s.concat(x.name));setLabSearch("")}} className="w-full text-left px-3 py-2 border-b last:border-0 hover:bg-slate-50"><span className="text-xs font-medium">{x.name}</span><span className="ml-2 text-[10px] text-gray-400">{x.category}</span></button>)}</div>}
      </div>
      {selectedLabs.length>0&&<div className="flex flex-wrap gap-1.5">{selectedLabs.map(l=><button type="button" key={l} onClick={()=>setSelectedLabs(s=>s.filter(x=>x!==l))} className="h-7 px-2 rounded-full bg-[#c2183a] text-white text-[10px]">{l} ×</button>)}</div>}
      <p className="text-[10px] text-gray-400">{EXPANDED_LAB_CATALOG.length} laboratory investigations available.</p>
      <textarea value={investigation.notes} onChange={e=>setInvestigation({...investigation,notes:e.target.value})} placeholder="Order notes / clinical indication" className="w-full min-h-16 px-2 py-1 rounded-lg border text-xs"/>
      <button disabled={saving||!selectedLabs.length} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold">{saving?"Saving…":"Place lab order"}</button>
     </form>
    )}
    {mainTab==="Orders"&&leftNav==="Radiology"&&(
     <form onSubmit={orderRad} className="space-y-3 max-w-3xl">
      <h3 className="font-semibold text-sm">Radiology / Diagnostic Orders</h3>
      <p className="text-[10px] text-gray-500">Search the full diagnostic catalogue by study, modality or body part.</p>
      <div className="relative">
       <input value={diagnosticSearch} onChange={e=>setDiagnosticSearch(e.target.value)} placeholder="Type CT, MRI, X-ray, echo, ultrasound…" className="w-full h-10 px-3 rounded-lg border text-sm" />
       {diagnosticSearch.trim()&&<div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-lg border bg-white shadow-lg">{EXPANDED_RADIOLOGY_CATALOG.filter(x=>{const q=diagnosticSearch.trim().toLowerCase();return x.name.toLowerCase().includes(q)||x.category.toLowerCase().includes(q)||x.modality.toLowerCase().includes(q)}).slice(0,40).map(x=><button type="button" key={x.id} onClick={()=>{setSelectedDiagnostics(s=>s.includes(x.name)?s:s.concat(x.name));setDiagnosticSearch("")}} className="w-full text-left px-3 py-2 border-b last:border-0 hover:bg-slate-50"><span className="text-xs font-medium">{x.name}</span><span className="ml-2 text-[10px] text-gray-400">{x.category} · {x.modality}</span></button>)}</div>}
      </div>
      {selectedDiagnostics.length>0&&<div className="flex flex-wrap gap-1.5">{selectedDiagnostics.map(l=><button type="button" key={l} onClick={()=>setSelectedDiagnostics(s=>s.filter(x=>x!==l))} className="h-7 px-2 rounded-full bg-[#c2183a] text-white text-[10px]">{l} ×</button>)}</div>}
      <p className="text-[10px] text-gray-400">{EXPANDED_RADIOLOGY_CATALOG.length} diagnostic studies available.</p>
      <textarea value={investigation.notes} onChange={e=>setInvestigation({...investigation,notes:e.target.value})} placeholder="Clinical indication" className="w-full min-h-16 px-2 py-1 rounded-lg border text-xs"/>
      <button disabled={saving||!selectedDiagnostics.length} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold">{saving?"Saving…":"Place imaging order"}</button>
     </form>
    )}
    {mainTab==="Orders"&&(leftNav==="Investigation Indent"||leftNav==="Procedure")&&(
     <div className="text-xs text-gray-600"><h3 className="font-semibold text-sm mb-2">{leftNav}</h3><p>Use Laboratory or Radiology left items for orders. Procedure notes can be entered under Clinical Notes.</p></div>
    )}

    {/* CLINICAL NOTES */}
    {mainTab==="Clinical Notes"&&leftNav==="Note View"&&(
     <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <h3 className="font-semibold text-sm">Note View</h3>
       <div className="flex flex-wrap gap-2 text-[10px]">
        <button type="button" onClick={()=>{setMainTab("Clinical Notes");setLeftNav("Initial Assessment")}} className="h-7 px-2 rounded border">+ Initial Assessment</button>
        <button type="button" onClick={()=>{setMainTab("Clinical Notes");setLeftNav("Progress Note")}} className="h-7 px-2 rounded border">+ Progress Note</button>
        <button type="button" onClick={()=>{setMainTab("Clinical Notes");setLeftNav("Consultant Note")}} className="h-7 px-2 rounded border">+ Consultant Note</button>
       </div>
      </div>
      {noteViewId?(
       <div className="border rounded-lg p-3 bg-white">
        <button type="button" onClick={()=>setNoteViewId(null)} className="text-[11px] text-[#c2183a] mb-2">← Back to note list</button>
        {(()=>{const n=(clinicalNotes||[]).find((x:any)=>(x.id||String(clinicalNotes.indexOf(x)))===noteViewId)||clinicalNotes.find((x:any)=>x.id===noteViewId);if(!n)return <p className="text-xs text-gray-500">Note not found.</p>;return <div><p className="font-semibold text-sm">{n.noteType||n.title||"Note"}</p><p className="text-[10px] text-gray-500 mt-0.5">{n.authorName||n.authorRole||"Clinician"} · {n.createdAt?new Date(n.createdAt).toLocaleString("en-IN"):"—"} · {n.status||"COMPLETED"}</p><pre className="mt-3 whitespace-pre-wrap font-sans text-xs text-gray-800 bg-slate-50 rounded-lg p-3 border">{n.content||"—"}</pre></div>})()}
       </div>
      ):(
       <div className="overflow-auto border rounded-lg">
        <table className="w-full text-left text-[11px]">
         <thead className="bg-slate-50 text-gray-600"><tr>
          <th className="p-2 border-b">Notes Title</th><th className="p-2 border-b">Date of Entry</th><th className="p-2 border-b">Status</th><th className="p-2 border-b">Author</th><th className="p-2 border-b">Action</th>
         </tr></thead>
         <tbody>
          {(clinicalNotes||[]).length?clinicalNotes.map((n:any,i:number)=>{
            const id=n.id||String(i);
            return <tr key={id} className="hover:bg-amber-50/60 cursor-pointer" onClick={()=>setNoteViewId(id)}>
             <td className="p-2 border-b font-medium">{n.noteType||n.title||"Clinical note"}</td>
             <td className="p-2 border-b">{n.createdAt?new Date(n.createdAt).toLocaleString("en-IN"):"—"}</td>
             <td className="p-2 border-b"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${(n.status||"COMPLETED")==="UNSIGNED"||(n.status||"")==="UNCOSIGNED"?"bg-amber-100 text-amber-800":"bg-green-50 text-green-700"}`}>{n.status||"COMPLETED"}</span></td>
             <td className="p-2 border-b">{n.authorName||n.authorRole||"—"}</td>
             <td className="p-2 border-b"><button type="button" className="text-[#c2183a] font-medium" onClick={(e)=>{e.stopPropagation();setNoteViewId(id)}}>Open</button></td>
            </tr>}) : <tr><td colSpan={5} className="p-4 text-gray-500">No clinical notes yet. Use left nav to add Initial Assessment, Progress Note, or Consultant Note.</td></tr>}
         </tbody>
        </table>
        <p className="text-[10px] text-gray-500 p-2">Showing {(clinicalNotes||[]).length} note{(clinicalNotes||[]).length===1?"":"s"}</p>
       </div>
      )}
     </div>
    )}
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
      
      <div className="border rounded-lg p-3 bg-slate-50/80 space-y-2">
       <p className="text-[11px] font-semibold text-gray-700">Order investigations from assessment</p>
       <p className="text-[10px] text-gray-500">Select labs / imaging here — same as Orders tab; no need to leave this form.</p>
       <div className="flex flex-wrap gap-1.5 max-h-24 overflow-auto">{EXPANDED_LAB_CATALOG.map(l=><label key={l.id} className="inline-flex items-center gap-1 text-[10px] border rounded px-1.5 py-0.5 bg-white"><input type="checkbox" checked={selectedLabs.includes(l.name)} onChange={()=>setSelectedLabs(selectedLabs.includes(l.name)?selectedLabs.filter(x=>x!==l.name):[...selectedLabs,l.name])}/>{l.name}</label>)}</div>
       <div className="flex flex-wrap gap-1.5 max-h-20 overflow-auto">{EXPANDED_RADIOLOGY_CATALOG.map(d=><label key={d.id} className="inline-flex items-center gap-1 text-[10px] border rounded px-1.5 py-0.5 bg-white"><input type="checkbox" checked={selectedDiagnostics.includes(d.name)} onChange={()=>setSelectedDiagnostics(selectedDiagnostics.includes(d.name)?selectedDiagnostics.filter(x=>x!==d.name):[...selectedDiagnostics,d.name])}/>{d.name}</label>)}</div>
       <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving||!selectedLabs.length} onClick={async()=>{if(!selected||!selectedLabs.length)return;await run({action:"lab-order",patientId:selected.id,tests:selectedLabs,notes:investigation.notes},`Lab order placed`);setSelectedLabs([])}} className="h-8 px-3 rounded-lg border text-[10px] font-semibold disabled:opacity-50">Place lab order ({selectedLabs.length})</button>
        <button type="button" disabled={saving||!selectedDiagnostics.length} onClick={async()=>{if(!selected)return;const tests=selectedDiagnostics.length?selectedDiagnostics:[diagnosticType];await run({action:"diagnostic-order",patientId:selected.id,tests,notes:investigation.notes},`Imaging order placed`);setSelectedDiagnostics([])}} className="h-8 px-3 rounded-lg border text-[10px] font-semibold disabled:opacity-50">Place imaging order ({selectedDiagnostics.length})</button>
       </div>
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

    {/* COVER SHEET NOTES */}
    {mainTab==="Discharge Summary"&&["Transfer Summary","Discharge Summary","Pharmacy Summary","Death Summary","DAMA Summary","LAMA Summary","Fitness Note","Case Summary"].includes(leftNav)&&(
     <form onSubmit={saveDischargeStructured} className="space-y-3 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <div><h3 className="font-semibold text-sm">{coverNoteType}</h3><p className="text-[10px] text-gray-500">Prepare the selected hospital summary from the patient's complete chart. Discharge finalization is available only for Discharge Summary.</p></div>
       <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>setCoverNoteType(leftNav)} className="h-9 px-3 rounded-lg bg-slate-50 border text-xs font-medium">{leftNav}</button><select value={coverNoteType} onChange={e=>setCoverNoteType(e.target.value)} className="h-9 px-2 rounded-lg border text-xs">{NOTE_TYPES.map(t=><option key={t}>{t}</option>)}</select>{coverNoteType==="Discharge Summary"&&{selected.status==="DISCHARGED"&&<Link href={`/ipd-summaries/${selected.id}/print`} target="_blank" className="h-9 px-3 rounded-lg border text-xs inline-flex items-center">Print / Save PDF</Link>}}</div>
      </div>
      {coverNoteType==="Discharge Summary"&&<div className="border rounded-lg p-3 bg-white space-y-3">
       <div><p className="text-[11px] font-semibold">Administrative / Payer pathway</p><p className="text-[10px] text-gray-500">Choose the parallel clearance route; it does not replace the clinical discharge record.</p></div>
       <div className="flex flex-wrap gap-2">{["Self-pay / Cash","Insurance / TPA","ESIC","Other"].map(p=><button type="button" key={p} onClick={()=>setAdminPathway(p)} className={adminPathway===p?"h-8 px-3 rounded-full border text-[10px] font-semibold bg-[#140a1f] text-white":"h-8 px-3 rounded-full border text-[10px] font-semibold bg-white text-gray-700"}>{p}</button>)}</div>
       {adminPathway==="Insurance / TPA"&&<div className="grid md:grid-cols-2 gap-2">
        <select value={adminForm.providerId} onChange={e=>setAdminForm({...adminForm,providerId:e.target.value})} className="h-9 px-2 rounded-lg border text-xs"><option value="">Select insurer / TPA</option>{insuranceProviders.map((p:any)=><option key={p.id} value={p.id}>{p.name}{p.tpaName?" · TPA "+p.tpaName:""}</option>)}</select>
        <input value={adminForm.policyNumber} onChange={e=>setAdminForm({...adminForm,policyNumber:e.target.value})} placeholder="Policy number" className="h-9 px-2 rounded-lg border text-xs"/>
        <input value={adminForm.memberId} onChange={e=>setAdminForm({...adminForm,memberId:e.target.value})} placeholder="Member / beneficiary ID" className="h-9 px-2 rounded-lg border text-xs"/>
        <input value={adminForm.preauthNumber} onChange={e=>setAdminForm({...adminForm,preauthNumber:e.target.value})} placeholder="Pre-authorisation number" className="h-9 px-2 rounded-lg border text-xs"/>
        <input value={adminForm.claimNumber} onChange={e=>setAdminForm({...adminForm,claimNumber:e.target.value})} placeholder="Claim number (if available)" className="h-9 px-2 rounded-lg border text-xs"/>
        <input type="number" min="0" value={adminForm.requestedAmount} onChange={e=>setAdminForm({...adminForm,requestedAmount:e.target.value})} placeholder="Requested claim amount ₹" className="h-9 px-2 rounded-lg border text-xs"/>
        <button type="button" disabled={!adminForm.providerId||!adminForm.policyNumber||!adminForm.requestedAmount||saving} onClick={async()=>{setSaving(true);setAdminStatus("");try{let policyId=patientPolicies.find((p:any)=>p.providerId===adminForm.providerId&&p.policyNumber===adminForm.policyNumber)?.id;if(!policyId){const pr=await fetch("/api/insurance",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"policy",patientId:selected.id,providerId:adminForm.providerId,policyNumber:adminForm.policyNumber,memberId:adminForm.memberId})});const pd=await pr.json();if(!pr.ok||!pd.success)throw new Error(pd.error||"Could not create policy");policyId=pd.policy.id;}const cr=await fetch("/api/insurance",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"claim",patientId:selected.id,policyId,claimNumber:adminForm.claimNumber,preauthNumber:adminForm.preauthNumber,claimType:"IPD",requestedAmount:Number(adminForm.requestedAmount),notes:"Discharge administrative workflow"})});const cd=await cr.json();if(!cr.ok||!cd.success)throw new Error(cd.error||"Could not create claim");setAdminStatus("Insurance / TPA claim draft created.");}catch(e:any){setAdminStatus(e.message||"Could not create insurance workflow")}finally{setSaving(false)}}} className="h-8 px-3 rounded-lg bg-[#140a1f] text-white text-[10px] font-semibold">Create claim draft</button>
       </div>}
       {adminPathway==="ESIC"&&<div className="grid md:grid-cols-2 gap-2"><input value={adminForm.esicIpNumber} onChange={e=>setAdminForm({...adminForm,esicIpNumber:e.target.value})} placeholder="ESIC IP number" className="h-9 px-2 rounded-lg border text-xs"/><input value={adminForm.esicBeneficiaryNumber} onChange={e=>setAdminForm({...adminForm,esicBeneficiaryNumber:e.target.value})} placeholder="ESIC beneficiary number" className="h-9 px-2 rounded-lg border text-xs"/><input value={adminForm.esicAuthorizationNumber} onChange={e=>setAdminForm({...adminForm,esicAuthorizationNumber:e.target.value})} placeholder="ESIC authorization / approval number" className="h-9 px-2 rounded-lg border text-xs"/><input value={adminForm.esicPackageCode} onChange={e=>setAdminForm({...adminForm,esicPackageCode:e.target.value})} placeholder="ESIC package / code" className="h-9 px-2 rounded-lg border text-xs"/></div>}
       {(adminPathway==="Self-pay / Cash"||adminPathway==="Other")&&<textarea value={adminForm.administrativeNotes} onChange={e=>setAdminForm({...adminForm,administrativeNotes:e.target.value})} placeholder={adminPathway==="Self-pay / Cash"?"Billing / payment clearance notes":"Administrative pathway notes"} className="w-full min-h-14 px-2 py-1 rounded-lg border text-xs"/>}
       {patientPolicies.length>0&&<p className="text-[10px] text-gray-500">Existing patient policies: {patientPolicies.map((p:any)=>p.policyNumber).join(", ")}</p>}
       {patientInvoices.length>0&&<p className="text-[10px] text-gray-500">Invoices: {patientInvoices.map((i:any)=>i.invoiceNumber||"Invoice").join(", ")}</p>}
       {adminStatus&&<p className="text-[10px] text-green-700 font-medium">{adminStatus}</p>}
      </div>}
      {coverNoteType==="Pharmacy Summary"&&<div className="border rounded-lg p-3 bg-emerald-50/40"><p className="text-[11px] font-semibold">Pharmacy Summary</p><p className="text-[10px] text-gray-600">Use Pull all chart data to bring medication orders, advice and medication indent history into this summary. This does not discharge the patient.</p></div>}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] border rounded-lg p-2 bg-slate-50"><div className="w-full flex items-center justify-between"><span className="font-semibold text-gray-600">Pull from patient chart</span><button type="button" onClick={pullCompleteChart} className="text-[#c2183a] font-semibold mr-2">Pull all chart data</button><button type="button" onClick={()=>setSectionPull({vitals:true,allergies:true,problems:true,diagnosis:true,complaints:true,medications:true,laboratory:true,radiology:true,clinicalNotes:true,orders:true,medicationAdvice:true})} className="text-[#c2183a] font-semibold">Select all</button></div>
       {[["vitals","Vitals"],["allergies","Allergies"],["problems","Problems"],["diagnosis","Diagnosis"],["complaints","Complaints"],["medications","Medications"],["laboratory","Laboratory"],["radiology","Radiology"],["clinicalNotes","Clinical Notes"],["orders","Orders"],["medicationAdvice","Medication Advice"]].map(([k,l])=>(
        <label key={k} className="inline-flex items-center gap-1"><input type="checkbox" checked={!!(sectionPull as any)[k]} onChange={e=>{
          const on=e.target.checked;setSectionPull({...sectionPull,[k]:on});
          if(on&&k==="allergies")setDischargeForm(f=>({...f,allergies:f.allergies||selected.allergies||""}));
          if(on&&k==="diagnosis")setDischargeForm(f=>({...f,diagnosis:f.diagnosis||selected.diagnosis||selected.workingDiagnosis||""}));
          if(on&&k==="complaints")setDischargeForm(f=>({...f,presentingComplaints:f.presentingComplaints||selected.chiefComplaint||""}));
        }}/>{l}</label>
       ))}
      </div>
      <div className="grid gap-2 text-xs">
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Date and Time of Discharge</span><input type="datetime-local" value={dischargeForm.dischargeDateTime} onChange={e=>setDischargeForm({...dischargeForm,dischargeDateTime:e.target.value})} className="h-9 px-2 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Diagnosis</span><input value={dischargeForm.diagnosis} onChange={e=>setDischargeForm({...dischargeForm,diagnosis:e.target.value})} className="h-9 px-2 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Presenting Complaints</span><textarea value={dischargeForm.presentingComplaints} onChange={e=>setDischargeForm({...dischargeForm,presentingComplaints:e.target.value})} className="min-h-14 px-2 py-1 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">History of Present Illness</span><textarea value={dischargeForm.hpi} onChange={e=>setDischargeForm({...dischargeForm,hpi:e.target.value})} className="min-h-14 px-2 py-1 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Past Medical History</span><textarea value={dischargeForm.pastMedicalHistory} onChange={e=>setDischargeForm({...dischargeForm,pastMedicalHistory:e.target.value})} className="min-h-12 px-2 py-1 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Current Medication</span><textarea value={dischargeForm.currentMedication} onChange={e=>setDischargeForm({...dischargeForm,currentMedication:e.target.value})} className="min-h-12 px-2 py-1 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Personal History</span><input value={dischargeForm.personalHistory} onChange={e=>setDischargeForm({...dischargeForm,personalHistory:e.target.value})} className="h-9 px-2 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Family History</span><input value={dischargeForm.familyHistory} onChange={e=>setDischargeForm({...dischargeForm,familyHistory:e.target.value})} className="h-9 px-2 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Allergies</span><input value={dischargeForm.allergies} onChange={e=>setDischargeForm({...dischargeForm,allergies:e.target.value})} className="h-9 px-2 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Occupational History</span><input value={dischargeForm.occupationalHistory} onChange={e=>setDischargeForm({...dischargeForm,occupationalHistory:e.target.value})} className="h-9 px-2 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">On Examination</span><textarea value={dischargeForm.onExamination} onChange={e=>setDischargeForm({...dischargeForm,onExamination:e.target.value})} className="min-h-14 px-2 py-1 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Course In Hospital</span><textarea value={dischargeForm.courseInHospital} onChange={e=>setDischargeForm({...dischargeForm,courseInHospital:e.target.value})} className="min-h-16 px-2 py-1 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Procedure</span><input value={dischargeForm.procedure} onChange={e=>setDischargeForm({...dischargeForm,procedure:e.target.value})} className="h-9 px-2 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Surgery</span><input value={dischargeForm.surgery} onChange={e=>setDischargeForm({...dischargeForm,surgery:e.target.value})} className="h-9 px-2 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Findings</span><textarea value={dischargeForm.findings} onChange={e=>setDischargeForm({...dischargeForm,findings:e.target.value})} className="min-h-12 px-2 py-1 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Condition on Discharge</span><input value={dischargeForm.conditionOnDischarge} onChange={e=>setDischargeForm({...dischargeForm,conditionOnDischarge:e.target.value})} className="h-9 px-2 rounded-lg border"/></label>
       
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Investigation</span><textarea value={dischargeForm.investigation} onChange={e=>setDischargeForm({...dischargeForm,investigation:e.target.value})} className="min-h-12 px-2 py-1 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Medications During Stay</span><textarea value={dischargeForm.medicationsDuringStay} onChange={e=>setDischargeForm({...dischargeForm,medicationsDuringStay:e.target.value})} className="min-h-12 px-2 py-1 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Advice</span><textarea value={dischargeForm.advice} onChange={e=>setDischargeForm({...dischargeForm,advice:e.target.value})} className="min-h-12 px-2 py-1 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Special Needs</span><input value={dischargeForm.specialNeeds} onChange={e=>setDischargeForm({...dischargeForm,specialNeeds:e.target.value})} className="h-9 px-2 rounded-lg border"/></label>
       <label className="grid gap-0.5"><span className="text-[10px] text-gray-500">Follow Up Advice</span><textarea value={dischargeForm.followUpAdvice} onChange={e=>setDischargeForm({...dischargeForm,followUpAdvice:e.target.value})} className="min-h-12 px-2 py-1 rounded-lg border"/></label>
      </div>
      <label className="flex items-start gap-2 text-[10px] text-gray-600"><input type="checkbox" checked={dischargeForm.ack} onChange={e=>setDischargeForm({...dischargeForm,ack:e.target.checked})} className="mt-0.5"/><span>I / we have understood and hereby acknowledge receipt of the discharge summary.</span></label>
      <div className="flex flex-wrap gap-2">
       <button disabled={saving} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold">{saving?"Saving…":"Save Note Draft"}</button>
       {coverNoteType==="Discharge Summary"&&<button type="button" onClick={finalizeDischarge} disabled={saving} className="h-9 px-4 rounded-lg border border-red-300 text-red-700 text-xs font-semibold">{saving?"Finalizing…":"Discharge Patient"}</button>}
       <button type="button" onClick={()=>{setMainTab("Clinical Notes");setLeftNav("Note View")}} className="h-9 px-3 rounded-lg border text-xs">View saved notes</button>
      </div>    </form>
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
    <input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Address" className="h-9 px-2 rounded-lg border col-span-2"/>
    <select value={form.idType} onChange={e=>setForm({...form,idType:e.target.value})} className="h-9 px-2 rounded-lg border"><option>Aadhaar</option><option>PAN</option><option>Passport</option><option>Other</option></select>
    <input value={form.idNumber} onChange={e=>setForm({...form,idNumber:e.target.value})} placeholder="ID number" className="h-9 px-2 rounded-lg border"/>
    <input value={form.mlcNumber} onChange={e=>setForm({...form,mlcNumber:e.target.value})} placeholder="MLC number (if applicable)" className="h-9 px-2 rounded-lg border"/>
    <input value={form.prdNumber} onChange={e=>setForm({...form,prdNumber:e.target.value})} placeholder="PRD number" className="h-9 px-2 rounded-lg border"/>
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

  {showTransfer&&selected&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={transferPatient} className="bg-white rounded-xl max-w-sm w-full p-4 space-y-2"><h3 className="font-semibold">Transfer IPD patient</h3>
   <select required value={transferRoom} onChange={e=>setTransferRoom(e.target.value)} className="w-full h-9 px-2 rounded-lg border text-xs"><option value="">Select destination room</option>{rooms.filter((r:any)=>!r.occupied||r.roomNumber===selected.roomNumber).map((r:any)=><option key={r.id} value={r.roomNumber}>Room {r.roomNumber} · {r.roomCategory}</option>)}</select>
   <div className="flex gap-2 justify-end"><button type="button" onClick={()=>setShowTransfer(false)} className="h-9 px-3 rounded-lg border text-xs">Cancel</button><button disabled={saving} className="h-9 px-3 rounded-lg bg-[#140a1f] text-white text-xs">Confirm transfer</button></div>
  </form></div>}

  {showHandover&&selected&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={doHandover} className="bg-white rounded-xl max-w-sm w-full p-4 space-y-2"><h3 className="font-semibold">Clinical handover</h3><p className="text-[10px] text-gray-500">Current receiving clinician/team</p>
   <select required value={handover.receivingMemberId} onChange={e=>setHandover({...handover,receivingMemberId:e.target.value})} className="w-full h-9 px-2 rounded-lg border text-xs"><option value="">Select receiving clinician</option>{handoverOptions.map((o:any)=><option key={o.id} value={o.id}>{o.name||o.email}</option>)}</select>
   <textarea value={handover.context} onChange={e=>setHandover({...handover,context:e.target.value})} placeholder="Handover context" className="w-full min-h-16 px-2 py-1 rounded-lg border text-xs"/>
   <div className="flex gap-2 justify-end"><button type="button" onClick={()=>setShowHandover(false)} className="h-9 px-3 rounded-lg border text-xs">Cancel</button><button disabled={saving} className="h-9 px-3 rounded-lg bg-[#140a1f] text-white text-xs">Confirm handover</button></div>
  </form></div>}

 </div></AppShell>;
}
