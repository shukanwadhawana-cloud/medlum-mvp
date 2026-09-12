"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { apiAddPatient, apiAddPrescriptionWithEncounter, apiCreateEncounter, apiGetPatientDetail, apiGetPatients } from "@/lib/api";

type Patient = { id: string; name: string; age: number; gender: string; phone: string; allergies?: string; bp?: string };
type Field = "chiefComplaint" | "clinicalNotes" | "diagnosis" | "assessment" | "plan" | "medicines" | "advice";
type SpeechRecognitionInstance = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: any) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function parseScan(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  const out: Record<string, string> = { clinicalNotes: clean };
  const name = clean.match(/(?:patient\s*name|name)\s*[:\-]\s*([A-Za-z .'-]{2,60})(?=\s+(?:age|sex|gender|dob|mobile|phone)\b|$)/i)?.[1];
  const age = clean.match(/(?:age)\s*[:\-]?\s*(\d{1,3})\s*(?:years?|yrs?)?/i)?.[1];
  const gender = clean.match(/(?:sex|gender)\s*[:\-]?\s*(male|female|other)/i)?.[1];
  const phone = clean.match(/(?:mobile|phone|contact)\s*[:\-]?\s*([+\d][\d ()-]{6,18})/i)?.[1];
  const bp = clean.match(/(?:bp|blood pressure)\s*[:\-]?\s*(\d{2,3}\s*\/\s*\d{2,3})/i)?.[1];
  const diagnosis = clean.match(/(?:diagnosis|impression)\s*[:\-]\s*(.{3,160}?)(?=\s+(?:plan|advice|medication|medicines?)\s*[:\-]|$)/i)?.[1];
  const medicines = clean.match(/(?:medication|medicines?|rx|treatment)\s*[:\-]\s*(.{3,300}?)(?=\s+(?:advice|plan|follow[- ]?up)\s*[:\-]|$)/i)?.[1];
  if (name) out.name = name.trim(); if (age) out.age = age; if (gender) out.gender = gender; if (phone) out.phone = phone.trim(); if (bp) out.bp = bp.replace(/\s/g, ""); if (diagnosis) out.diagnosis = diagnosis.trim(); if (medicines) out.medicines = medicines.trim();
  return out;
}

export default function ClinicalAssistPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [mode, setMode] = useState<"followup" | "new">("new");
  const [scanText, setScanText] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [voiceField, setVoiceField] = useState<Field | null>(null);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [form, setForm] = useState({ name: "", age: "", gender: "Male", phone: "", bp: "", allergies: "", chiefComplaint: "", clinicalNotes: "", diagnosis: "", assessment: "", plan: "", medicines: "", advice: "" });

  useEffect(() => {
    apiGetPatients().then((x) => setPatients(x as Patient[]));
    const initialPatientId = new URLSearchParams(window.location.search).get("patientId") || "";
    if (initialPatientId) { setPatientId(initialPatientId); setMode("followup"); }
  }, []);
  useEffect(() => { if (patientId) apiGetPatientDetail(patientId).then((d) => { const p=d?.patient; const e=d?.encounters?.[0]; if(p) setForm(f=>({...f,name:p.name,age:String(p.age||""),gender:p.gender||"Male",phone:p.phone||"",bp:p.bp||"",allergies:p.allergies||"",clinicalNotes:e?.clinicalNotes||"",diagnosis:e?.diagnosis||"",assessment:e?.assessment||"",plan:e?.plan||"",chiefComplaint:"",medicines:"",advice:""})); }).catch(()=>{}); }, [patientId]);

  const filteredPatients = useMemo(() => { const q=patientSearch.toLowerCase().trim(); return q ? patients.filter(p=>p.name.toLowerCase().includes(q)||p.phone.toLowerCase().includes(q)).slice(0,8) : patients.slice(0,8); }, [patients,patientSearch]);
  function setField(field: string, value: string) { setForm(f => ({ ...f, [field]: value })); }

  async function scan(file: File) {
    setScanBusy(true); setScanStatus("Reading document locally…"); setError("");
    try {
      const { createWorker } = await import("tesseract.js"); const worker = await createWorker("eng"); const result = await worker.recognize(file); await worker.terminate();
      const text = result.data.text.trim(); setScanText(text); const parsed = parseScan(text);
      setForm(f=>({...f, ...(parsed.name ? {name:parsed.name}:{}), ...(parsed.age ? {age:parsed.age}:{}), ...(parsed.gender ? {gender:parsed.gender}:{}), ...(parsed.phone ? {phone:parsed.phone}:{}), ...(parsed.bp ? {bp:parsed.bp}:{}), ...(parsed.diagnosis ? {diagnosis:parsed.diagnosis}:{}), ...(parsed.medicines ? {medicines:parsed.medicines}:{}), clinicalNotes:text}));
      setScanStatus("Scan complete. Review every extracted field before saving.");
    } catch { setError("Document OCR could not complete on this device. You can still use the captured text and voice dictation."); } finally { setScanBusy(false); }
  }

  function toggleVoice(field: Field) {
    if (voiceField === field) { recognitionRef.current?.stop(); setVoiceField(null); setVoiceStatus(""); return; }
    const SR = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition || (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    if (!SR) { setVoiceStatus("Voice dictation is not supported by this browser. Try Safari/Chrome on the phone."); return; }
    const r = new SR(); r.lang = "en-IN"; r.continuous = true; r.interimResults = true;
    r.onresult = (event:any) => { let text=""; for(let i=event.resultIndex;i<event.results.length;i++) text += event.results[i][0].transcript; setForm(f=>({...f,[field]:`${f[field] ? f[field]+" " : ""}${text}`.trim()})); };
    r.onerror = () => { setVoiceStatus("Microphone/dictation error. Check microphone permission."); setVoiceField(null); }; r.onend = () => { setVoiceField(null); setVoiceStatus(""); };
    recognitionRef.current = r; r.start(); setVoiceField(field); setVoiceStatus("Listening… tap the microphone again to stop.");
  }

  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      let id = patientId;
      if (mode === "new") {
        if (!form.name || !form.phone) throw new Error("New patient needs at least name and mobile number.");
        const created = await apiAddPatient({ name:form.name, age:form.age, gender:form.gender, phone:form.phone, bp:form.bp, allergies:form.allergies, notes:form.clinicalNotes });
        if (!created.success || !created.patient) throw new Error(created.error || "Could not create patient."); id=created.patient.id; setPatientId(id);
      }
      if (!id) throw new Error("Select an existing patient or use New patient.");
      const enc = await apiCreateEncounter({ patientId:id, chiefComplaint:form.chiefComplaint, clinicalNotes:form.clinicalNotes, diagnosis:form.diagnosis, assessment:form.assessment, plan:form.plan, bp:form.bp, followUpDate:undefined });
      if (!enc.success || !enc.encounter) throw new Error(enc.error || "Could not save clinical note.");
      if (form.medicines.trim()) await apiAddPrescriptionWithEncounter({ patientId:id, patientName:form.name, medicines:form.medicines.trim(), advice:form.advice.trim(), encounterId:enc.encounter.id });
      setMessage(mode === "new" ? "New patient + clinical encounter saved." : "Follow-up clinical encounter saved."); setScanText("");
    } catch(e) { setError(e instanceof Error ? e.message : "Could not save."); } finally { setSaving(false); }
  }

  return <AppShell><div className="mb-3"><Link href="/patients" className="text-xs text-[#c2183a]">← Patients</Link><h2 className="text-lg font-semibold mt-1">Clinical AI Assistant</h2><p className="text-xs text-gray-500">Scan a previous summary or dictate your note, then review before saving.</p></div>
    <div className="space-y-3">
      <section className="bg-white border rounded-xl p-3"><div className="flex gap-2"><button onClick={()=>setMode("followup")} className={`flex-1 h-9 rounded-lg text-xs font-medium border ${mode==="followup"?"bg-[#c2183a] text-white":""}`}>Existing patient</button><button onClick={()=>{setMode("new");setPatientId("");}} className={`flex-1 h-9 rounded-lg text-xs font-medium border ${mode==="new"?"bg-[#c2183a] text-white":""}`}>New patient</button></div>
        {mode==="followup" && <><input value={patientSearch} onChange={e=>setPatientSearch(e.target.value)} placeholder="Search patient by name or phone" className="w-full h-10 border rounded-lg px-3 text-sm mt-3"/><div className="mt-2 space-y-1">{filteredPatients.map(p=><button key={p.id} onClick={()=>{setPatientId(p.id);setPatientSearch("");}} className={`w-full text-left px-3 py-2 rounded-lg border text-xs ${patientId===p.id?"border-[#c2183a] bg-red-50":""}`}>{p.name} · {p.age} yrs · {p.phone}</button>)}</div></>}
      </section>
      <section className="bg-white border rounded-xl p-3"><h3 className="font-semibold text-sm">📷 Scan previous summary</h3><p className="text-[11px] text-gray-500 mt-1">On a phone, this opens the camera. OCR runs locally in the browser; nothing is automatically trusted or saved.</p><input type="file" accept="image/*" capture="environment" onChange={e=>{const f=e.target.files?.[0];if(f)scan(f)}} className="mt-3 w-full text-xs"/>{scanBusy&&<p className="text-xs text-gray-500 mt-2">{scanStatus}</p>}{scanStatus&&!scanBusy&&<p className="text-xs text-green-700 mt-2">{scanStatus}</p>}{scanText&&<details className="mt-2"><summary className="text-xs font-medium">View extracted text</summary><textarea value={scanText} onChange={e=>setScanText(e.target.value)} className="w-full mt-2 min-h-28 border rounded-lg p-2 text-xs"/></details>}</section>
      {error&&<div className="bg-red-50 text-red-700 rounded-lg p-3 text-xs">{error}</div>}{message&&<div className="bg-green-50 text-green-700 rounded-lg p-3 text-xs">{message}</div>}
      <section className="bg-white border rounded-xl p-3"><h3 className="font-semibold text-sm mb-2">Patient details</h3><div className="grid grid-cols-2 gap-2"><Input label="Name" value={form.name} onChange={v=>setField("name",v)}/><Input label="Mobile" value={form.phone} onChange={v=>setField("phone",v)}/><Input label="Age" value={form.age} onChange={v=>setField("age",v)}/><label className="text-[11px] font-medium">Gender<select value={form.gender} onChange={e=>setField("gender",e.target.value)} className="mt-1 w-full h-10 border rounded-lg px-2 text-sm"><option>Male</option><option>Female</option><option>Other</option></select></label><Input label="BP" value={form.bp} onChange={v=>setField("bp",v)}/><Input label="Allergies" value={form.allergies} onChange={v=>setField("allergies",v)}/></div></section>
      <section className="bg-white border rounded-xl p-3 space-y-2"><h3 className="font-semibold text-sm">Clinical note</h3>{(["chiefComplaint","clinicalNotes","diagnosis","assessment","plan","medicines","advice"] as Field[]).map(field=><Dictated label={field.replace(/([A-Z])/g," $1")} value={form[field]} active={voiceField===field} onChange={v=>setField(field,v)} onVoice={()=>toggleVoice(field)} />)}{voiceStatus&&<p className="text-xs text-[#c2183a]">{voiceStatus}</p>}</section>
      <button onClick={save} disabled={saving || scanBusy} className="w-full h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-50">{saving?"Saving…":"Review & save clinical encounter"}</button>
      <p className="text-[10px] text-gray-400 text-center">AI assistant output is a drafting aid. Verify patient identity, extracted text, diagnosis, medicines and doses before saving or acting clinically.</p>
    </div></AppShell>
}
function Input({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="text-[11px] font-medium">{label}<input value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full h-10 border rounded-lg px-2 text-sm"/></label>}
function Dictated({label,value,active,onChange,onVoice}:{label:string;value:string;active:boolean;onChange:(v:string)=>void;onVoice:()=>void}){return <div><div className="flex items-center justify-between"><label className="text-[11px] font-medium capitalize">{label}</label><button type="button" onClick={onVoice} className={`text-[11px] px-2 py-1 rounded-md border ${active?"bg-[#c2183a] text-white":""}`}>{active?"■ Stop":"🎙 Dictate"}</button></div><textarea value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full min-h-16 border rounded-lg p-2 text-sm"/></div>}
