"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { apiAddPatient, apiAddPrescriptionWithEncounter, apiCreateEncounter, apiGetPatientDetail, apiGetPatients } from "@/lib/api";
import { detectClinicalTerms, normalizeClinicalText, type ClinicalTerm } from "@/lib/clinical/terminology";

type Patient = { id: string; name: string; age: number; gender: string; phone: string; allergies?: string; bp?: string };
type Field = "chiefComplaint" | "clinicalNotes" | "diagnosis" | "assessment" | "plan" | "medicines" | "advice";
type SpeechRecognitionResultEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type SpeechRecognitionInstance = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: SpeechRecognitionResultEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
type ScanResult = { text: string; confidence: number; label: string };

function parseScan(text: string) {
  const lines = text.split(/\n+/).map((x) => x.replace(/[|]+/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const clean = lines.join(" ");
  const out: Record<string, string> = { clinicalNotes: clean };
  const valueAfter = (labels: string[]) => {
    const re = new RegExp(`(?:${labels.join("|")})\\s*[:\\-]?\\s*([^\\n]+)`, "i");
    return text.match(re)?.[1]?.trim();
  };
  const name = valueAfter(["patient\\s*name", "patient", "name"]);
  const age = clean.match(/(?:age|years?\s*old)\s*[:\-]?\s*(\d{1,3})/i)?.[1];
  const gender = clean.match(/(?:sex|gender)\s*[:\-]?\s*(male|female|other|m|f)/i)?.[1];
  const phone = clean.match(/(?:mobile|phone|contact|telephone)\s*[:\-]?\s*([+\d][\d ()-]{6,18})/i)?.[1];
  const bp = clean.match(/(?:bp|blood pressure)\s*[:\-]?\s*(\d{2,3}\s*\/\s*\d{2,3})/i)?.[1];
  const diagnosis = valueAfter(["final diagnosis", "discharge diagnosis", "diagnosis", "impression", "assessment"]);
  const medicines = valueAfter(["discharge medications", "medications", "medicines", "prescription", "rx", "treatment"]);
  const advice = valueAfter(["discharge advice", "advice", "instructions", "follow[- ]?up"]);
  if (name && name.length < 80) out.name = name.replace(/^(patient|name)\s*[:\-]?\s*/i, "").trim();
  if (age) out.age = age;
  if (gender) out.gender = /^(m|male)$/i.test(gender) ? "Male" : /^(f|female)$/i.test(gender) ? "Female" : "Other";
  if (phone) out.phone = phone.trim();
  if (bp) out.bp = bp.replace(/\s/g, "");
  if (diagnosis) out.diagnosis = normalizeClinicalText(diagnosis.replace(/\s+/g, " ").trim()).text;
  if (medicines) out.medicines = medicines.replace(/\s+/g, " ").trim();
  if (advice) out.advice = advice.replace(/\s+/g, " ").trim();
  return out;
}

async function preprocessImage(file: File, variant: "clean" | "contrast" | "threshold") {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 2400;
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable on this device.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (variant === "threshold") {
      const v = gray > 170 ? 255 : gray < 95 ? 0 : Math.round(((gray - 95) / 75) * 255);
      data[i] = data[i + 1] = data[i + 2] = v;
    } else if (variant === "contrast") {
      const v = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
      data[i] = data[i + 1] = data[i + 2] = v;
    } else {
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
  }
  ctx.putImageData(image, 0, 0);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not prepare scan.")), "image/png", 1));
}

async function runOcr(file: File): Promise<ScanResult> {
  const { createWorker, PSM } = await import("tesseract.js");
  const variants: Array<"clean" | "contrast" | "threshold"> = ["clean", "contrast", "threshold"];
  const worker = await createWorker("eng");
  const results: ScanResult[] = [];
  for (const variant of variants) {
    const prepared = await preprocessImage(file, variant);
    await worker.setParameters({ tessedit_pageseg_mode: variant === "contrast" ? PSM.SPARSE_TEXT : PSM.AUTO });
    const result = await worker.recognize(prepared);
    results.push({ text: result.data.text.trim(), confidence: result.data.confidence || 0, label: variant });
  }
  await worker.terminate();
  results.sort((a, b) => b.confidence - a.confidence);
  const best = results[0];
  if (!best?.text) throw new Error("No readable text was detected. Try a sharper, better-lit photo.");
  return best;
}

export default function ClinicalAssistPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [mode, setMode] = useState<"followup" | "new">("new");
  const [scanText, setScanText] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [scanConfidence, setScanConfidence] = useState<number | null>(null);
  const [detectedTerms, setDetectedTerms] = useState<ClinicalTerm[]>([]);
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
  function applyTerminology(field: Field) {
    const result = normalizeClinicalText(form[field]);
    setField(field, result.text);
    setDetectedTerms(detectClinicalTerms(result.text));
  }

  async function scan(file: File) {
    setScanBusy(true); setScanStatus("Preparing document: correcting contrast and removing camera noise…"); setScanConfidence(null); setError("");
    try {
      const best = await runOcr(file);
      const text = best.text; setScanText(text); setScanConfidence(best.confidence);
      const parsed = parseScan(text);
      const clinicalText = normalizeClinicalText(text);
      setDetectedTerms(clinicalText.detected);
      setForm(f=>({...f, ...(parsed.name ? {name:parsed.name}:{}), ...(parsed.age ? {age:parsed.age}:{}), ...(parsed.gender ? {gender:parsed.gender}:{}), ...(parsed.phone ? {phone:parsed.phone}:{}), ...(parsed.bp ? {bp:parsed.bp}:{}), ...(parsed.diagnosis ? {diagnosis:parsed.diagnosis}:{}), ...(parsed.medicines ? {medicines:parsed.medicines}:{}), ...(parsed.advice ? {advice:parsed.advice}:{}), clinicalNotes:text}));
      setScanStatus(best.confidence >= 80 ? "High-confidence OCR completed. Review the extracted fields." : best.confidence >= 55 ? "OCR completed with moderate confidence. Review the text carefully." : "OCR completed with low confidence. Retake the photo if possible.");
    } catch (e) { setError(e instanceof Error ? e.message : "Document OCR could not complete on this device."); setScanStatus(""); } finally { setScanBusy(false); }
  }

  function toggleVoice(field: Field) {
    if (voiceField === field) { recognitionRef.current?.stop(); setVoiceField(null); setVoiceStatus(""); return; }
    const SR = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition || (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    if (!SR) { setVoiceStatus("Voice dictation is not supported by this browser. Try Safari/Chrome on the phone."); return; }
    recognitionRef.current?.stop();
    const r = new SR(); r.lang = "en-IN"; r.continuous = true; r.interimResults = true;
    r.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
      }
      if (finalText.trim()) {
        const cleaned = normalizeClinicalText(finalText.trim());
        setDetectedTerms(cleaned.detected);
        setForm(f => ({ ...f, [field]: `${f[field] ? f[field] + " " : ""}${cleaned.text}`.trim() }));
      }
    };
    r.onerror = () => { setVoiceStatus("Microphone/dictation error. Check microphone permission and try again."); setVoiceField(null); }; r.onend = () => { setVoiceField(null); setVoiceStatus(""); };
    recognitionRef.current = r; r.start(); setVoiceField(field); setVoiceStatus("Listening… finalized speech is inserted and common clinical wording is recognized.");
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
      <section className="bg-white border rounded-xl p-3"><h3 className="font-semibold text-sm">📷 Document scanner + OCR</h3><p className="text-[11px] text-gray-500 mt-1">Take a clear photo of a discharge summary, prescription, referral or report. MedLum preprocesses the image and runs several OCR passes locally before choosing the strongest result.</p><input type="file" accept="image/*" capture="environment" onChange={e=>{const f=e.target.files?.[0];if(f)scan(f)}} className="mt-3 w-full text-xs"/>{scanBusy&&<p className="text-xs text-gray-500 mt-2">{scanStatus}</p>}{scanStatus&&!scanBusy&&<p className="text-xs text-green-700 mt-2">{scanStatus}{scanConfidence!==null?` OCR confidence: ${Math.round(scanConfidence)}%.`:""}</p>}{scanText&&<details className="mt-2" open><summary className="text-xs font-medium">Review extracted OCR text</summary><textarea value={scanText} onChange={e=>setScanText(e.target.value)} className="w-full mt-2 min-h-36 border rounded-lg p-2 text-xs"/><p className="text-[10px] text-gray-400 mt-1">The extracted text is only a drafting aid. Do not treat OCR confidence as clinical correctness.</p></details>}</section>
      {detectedTerms.length > 0 && <section className="bg-blue-50 border border-blue-100 rounded-xl p-3"><div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold text-sm">Clinical terminology detected</h3><p className="text-[10px] text-gray-500 mt-1">MedLum recognizes common clinical wording and suggests clinician-standard terminology. It does not diagnose.</p></div><span className="text-[10px] font-medium text-blue-700">{detectedTerms.length} term{detectedTerms.length === 1 ? "" : "s"}</span></div><div className="flex flex-wrap gap-1.5 mt-2">{detectedTerms.map((term) => <span key={`${term.phrase}-${term.preferred}`} className="px-2 py-1 rounded-full bg-white border border-blue-100 text-[10px]"><span className="text-gray-500">{term.phrase}</span><span className="mx-1">→</span><span className="font-semibold text-blue-800">{term.preferred}</span></span>)}</div></section>}
      {error&&<div className="bg-red-50 text-red-700 rounded-lg p-3 text-xs">{error}</div>}{message&&<div className="bg-green-50 text-green-700 rounded-lg p-3 text-xs">{message}</div>}
      <section className="bg-white border rounded-xl p-3"><h3 className="font-semibold text-sm mb-2">Patient details</h3><div className="grid grid-cols-2 gap-2"><Input label="Name" value={form.name} onChange={v=>setField("name",v)}/><Input label="Mobile" value={form.phone} onChange={v=>setField("phone",v)}/><Input label="Age" value={form.age} onChange={v=>setField("age",v)}/><label className="text-[11px] font-medium">Gender<select value={form.gender} onChange={e=>setField("gender",e.target.value)} className="mt-1 w-full h-10 border rounded-lg px-2 text-sm"><option>Male</option><option>Female</option><option>Other</option></select></label><Input label="BP" value={form.bp} onChange={v=>setField("bp",v)}/><Input label="Allergies" value={form.allergies} onChange={v=>setField("allergies",v)}/></div></section>
      <section className="bg-white border rounded-xl p-3 space-y-2"><h3 className="font-semibold text-sm">Clinical note + voice dictation</h3>{(["chiefComplaint","clinicalNotes","diagnosis","assessment","plan","medicines","advice"] as Field[]).map(field=><Dictated label={field.replace(/([A-Z])/g," $1")} value={form[field]} active={voiceField===field} onChange={v=>setField(field,v)} onVoice={()=>toggleVoice(field)} onTerminology={()=>applyTerminology(field)} />)}{voiceStatus&&<p className="text-xs text-[#c2183a]">{voiceStatus}</p>}</section>
      <button onClick={save} disabled={saving || scanBusy} className="w-full h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-50">{saving?"Saving…":"Review & save clinical encounter"}</button>
      <p className="text-[10px] text-gray-400 text-center">AI assistant output is a drafting aid. Verify patient identity, extracted text, diagnosis, medicines and doses before saving or acting clinically.</p>
    </div></AppShell>
}
function Input({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="text-[11px] font-medium">{label}<input value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full h-10 border rounded-lg px-2 text-sm"/></label>}
function Dictated({label,value,active,onChange,onVoice,onTerminology}:{label:string;value:string;active:boolean;onChange:(v:string)=>void;onVoice:()=>void;onTerminology:()=>void}){return <div><div className="flex items-center justify-between"><label className="text-[11px] font-medium capitalize">{label}</label><div className="flex gap-1"><button type="button" onClick={onTerminology} className="text-[10px] px-2 py-1 rounded-md border">Medical terms</button><button type="button" onClick={onVoice} className={`text-[11px] px-2 py-1 rounded-md border ${active?"bg-[#c2183a] text-white":""}`}>{active?"■ Stop":"🎙 Dictate"}</button></div></div><textarea value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full min-h-16 border rounded-lg p-2 text-sm"/></div>}
