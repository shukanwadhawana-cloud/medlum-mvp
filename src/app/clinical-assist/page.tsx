"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDoctor } from "@/components/DoctorProvider";
import { canAccessModule } from "@/lib/permissions";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { apiAddPatient, apiAddPrescriptionWithEncounter, apiCreateEncounter, apiGetPatientDetail, apiGetPatients } from "@/lib/api";
import { detectClinicalTerms, normalizeClinicalText, type ClinicalTerm } from "@/lib/clinical/terminology";
import ClinicalAiDraftPanel, { type AiDraftSections } from "@/components/ClinicalAiDraftPanel";
import { runClinicalAssistOcr } from "@/lib/clinical-assist-ocr";

type Patient = { id: string; name: string; age: number; gender: string; phone: string; allergies?: string; bp?: string };
type Field = "chiefComplaint" | "clinicalNotes" | "diagnosis" | "assessment" | "plan" | "medicines" | "advice";
type SpeechRecognitionResultEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type SpeechRecognitionInstance = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: SpeechRecognitionResultEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

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

export default function ClinicalAssistPage() {
  const { doctor, loading: authLoading } = useDoctor();
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
    if (!authLoading && doctor && canAccessModule(doctor.primaryRole, "clinical_assist")) {
      apiGetPatients().then((x) => setPatients(x as Patient[]));
    }
  }, [authLoading, doctor]);
  useEffect(() => {
    const initialPatientId = new URLSearchParams(window.location.search).get("patientId") || "";
    if (initialPatientId) { setPatientId(initialPatientId); setMode("followup"); }
  }, []);
  useEffect(() => { if (patientId) apiGetPatientDetail(patientId).then((d) => { const p=d?.patient; const e=d?.encounters?.[0]; if(p) setForm(f=>({...f,name:p.name,age:String(p.age||""),gender:p.gender||"Male",phone:p.phone||"",bp:p.bp||"",allergies:p.allergies||"",clinicalNotes:e?.clinicalNotes||"",diagnosis:e?.diagnosis||"",assessment:e?.assessment||"",plan:e?.plan||"",chiefComplaint:"",medicines:"",advice:""})); }).catch(()=>{}); }, [patientId]);

  const filteredPatients = useMemo(() => { const q=patientSearch.toLowerCase().trim(); return q ? patients.filter(p=>p.name.toLowerCase().includes(q)||p.phone.toLowerCase().includes(q)).slice(0,8) : patients.slice(0,8); }, [patients,patientSearch]);
  function setField(field: string, value: string) { setForm(f => ({ ...f, [field]: value })); }
  function applyAiDraft(draft: AiDraftSections) {
    setForm((f) => ({
      ...f,
      clinicalNotes: [draft.history, draft.examination].filter(Boolean).join("\n\n") || f.clinicalNotes,
      assessment: draft.assessment || f.assessment,
      plan: draft.plan || f.plan,
      advice: [draft.followUp, draft.patientInstructions].filter(Boolean).join("\n") || f.advice,
    }));
  }
  function applyTerminology(field: Field) {
    const result = normalizeClinicalText(form[field]);
    setField(field, result.text);
    setDetectedTerms(detectClinicalTerms(result.text));
  }

  async function scan(file: File) {
    setScanBusy(true); setScanStatus("Preparing document…"); setScanConfidence(null); setError("");
    try {
      const lowerName = file.name.toLowerCase();
      const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
      const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(lowerName);
      if (!isPdf && !isImage) throw new Error("Unsupported document type. Upload a PDF, JPG, PNG, or WebP image.");
      if (/\.heic$|\.heif$/i.test(lowerName) || file.type === "image/heic" || file.type === "image/heif") {
        throw new Error("HEIC/HEIF is not supported yet. Retake or export the image as JPG/PNG, or upload a PDF.");
      }
      if (file.size > 8 * 1024 * 1024) throw new Error("Document is larger than 8 MB. Choose a smaller PDF or image.");

      let ocrFile = file;
      if (isImage) {
        setScanStatus("Preparing photo for OCR…");
        const prepared = await preprocessImage(file, "clean");
        ocrFile = new File([prepared], "medlum-scan.png", { type: "image/png" });
        if (ocrFile.size > 8 * 1024 * 1024) {
          const compressed = await new Promise<Blob>((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(ocrFile);
            img.onload = () => {
              const max = 1600;
              const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
              const canvas = document.createElement("canvas");
              canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
              canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
              const ctx = canvas.getContext("2d");
              if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Could not prepare scan.")); return; }
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(url);
              canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not compress scan.")), "image/jpeg", 0.86);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read the prepared scan.")); };
            img.src = url;
          });
          ocrFile = new File([compressed], "medlum-scan.jpg", { type: "image/jpeg" });
        }
      }

      setScanStatus(isPdf ? "Reading PDF… scanned pages use private OCR." : "Running private OCR…");
      const best = await runClinicalAssistOcr(ocrFile);
      const text = best.text; setScanText(text); setScanConfidence(best.confidence); setError("");
      const parsed = parseScan(text);
      const clinicalText = normalizeClinicalText(text);
      setDetectedTerms(clinicalText.detected);
      setForm(f=>({...f, ...(parsed.name ? {name:parsed.name}:{}), ...(parsed.age ? {age:parsed.age}:{}), ...(parsed.gender ? {gender:parsed.gender}:{}), ...(parsed.phone ? {phone:parsed.phone}:{}), ...(parsed.bp ? {bp:parsed.bp}:{}), ...(parsed.diagnosis ? {diagnosis:parsed.diagnosis}:{}), ...(parsed.medicines ? {medicines:parsed.medicines}:{}), ...(parsed.advice ? {advice:parsed.advice}:{}), clinicalNotes:text}));
      const confidenceMessage = best.confidence === null
        ? "Document text extracted. Review it carefully."
        : best.confidence >= 80
          ? "High-confidence OCR completed. Review the extracted fields."
          : best.confidence >= 55
            ? "OCR completed with moderate confidence. Review the text carefully."
            : "OCR completed with low confidence. Retake the photo if possible.";
      setScanStatus(best.partial ? confidenceMessage + " Only the first OCR pages were processed." : confidenceMessage);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Document OCR could not complete.";
      setError(msg);
      setScanStatus("");
      setScanConfidence(null);
    } finally {
      setScanBusy(false);
    }
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

  if (authLoading || !doctor) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Loading...</div>;
  if (!canAccessModule(doctor.primaryRole, "clinical_assist")) return <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">Clinical Assist is not available for this role.</div>;

  return <AppShell><div className="mb-3"><Link href="/patients" className="text-xs text-[#c2183a]">← Patients</Link><h2 className="text-lg font-semibold mt-1">Clinical AI Assistant</h2><p className="text-xs text-gray-500">Scan a previous summary or dictate your note, then review before saving.</p></div>
    <div className="space-y-3">
      <section className="bg-white border rounded-xl p-3"><div className="flex gap-2"><button onClick={()=>setMode("followup")} className={`flex-1 h-9 rounded-lg text-xs font-medium border ${mode==="followup"?"bg-[#c2183a] text-white":""}`}>Existing patient</button><button onClick={()=>{setMode("new");setPatientId("");}} className={`flex-1 h-9 rounded-lg text-xs font-medium border ${mode==="new"?"bg-[#c2183a] text-white":""}`}>New patient</button></div>
        {mode==="followup" && (<div className="mt-3 space-y-2"><input value={patientSearch} onChange={e=>setPatientSearch(e.target.value)} placeholder="Search patient" className="w-full h-10 border rounded-lg px-3 text-sm"/><div className="space-y-1">{filteredPatients.map(p=><button key={p.id} onClick={()=>setPatientId(p.id)} className={`w-full text-left border rounded-lg px-3 py-2 text-sm ${patientId===p.id?"border-[#c2183a] bg-red-50":""}`}>{p.name} · {p.age}/{p.gender} · {p.phone}</button>)}</div></div>)}
        {mode==="new" && (<div className="mt-3 grid grid-cols-2 gap-2"><input value={form.name} onChange={e=>setField("name",e.target.value)} placeholder="Name" className="h-10 border rounded-lg px-3 text-sm"/><input value={form.age} onChange={e=>setField("age",e.target.value)} placeholder="Age" className="h-10 border rounded-lg px-3 text-sm"/><select value={form.gender} onChange={e=>setField("gender",e.target.value)} className="h-10 border rounded-lg px-3 text-sm"><option>Male</option><option>Female</option><option>Other</option></select><input value={form.phone} onChange={e=>setField("phone",e.target.value)} placeholder="Mobile" className="h-10 border rounded-lg px-3 text-sm"/><input value={form.bp} onChange={e=>setField("bp",e.target.value)} placeholder="BP" className="h-10 border rounded-lg px-3 text-sm"/><input value={form.allergies} onChange={e=>setField("allergies",e.target.value)} placeholder="Allergies" className="h-10 border rounded-lg px-3 text-sm"/></div>)}
      </section>
      <section className="bg-white border rounded-xl p-3"><h3 className="font-semibold text-sm">Document scanner + OCR</h3><p className="text-[11px] text-gray-500 mt-1">Upload a PDF/document or take a clear photo. OCR runs on MedLum private infrastructure. Review extracted text before clinical use.</p><input id="clinical-document-upload" type="file" accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={e=>{const f=e.target.files?.[0];if(f)scan(f);e.currentTarget.value=""}} className="sr-only"/>
        <div className="mt-2 flex gap-2"><label htmlFor="clinical-document-upload" className="flex-1 h-10 rounded-lg border text-xs font-medium flex items-center justify-center cursor-pointer">{scanBusy?"Working…":"Upload / scan document"}</label></div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        {!scanBusy && scanStatus && <p className="text-xs text-green-700 mt-2" role="status">{scanStatus}{scanConfidence !== null ? ` OCR confidence: ${Math.round(scanConfidence)}%.` : ""}</p>}
        {scanText && (<details className="mt-2" open><summary className="text-xs font-medium">Review extracted OCR text</summary><textarea value={scanText} onChange={e=>setScanText(e.target.value)} className="mt-1 w-full min-h-[120px] border rounded-lg p-2 text-xs" /></details>)}
      </section>
      <ClinicalAiDraftPanel patientId={patientId||undefined} sourceText={scanText||form.clinicalNotes} onApply={applyAiDraft} />
      <section className="bg-white border rounded-xl p-3 space-y-2"><h3 className="font-semibold text-sm">Clinical note</h3>
        {(["chiefComplaint","clinicalNotes","diagnosis","assessment","plan","medicines","advice"] as Field[]).map(field=>(
          <div key={field}><div className="flex items-center justify-between"><label className="text-xs font-medium capitalize">{field.replace(/([A-Z])/g," $1")}</label><div className="flex gap-1"><button type="button" onClick={()=>toggleVoice(field)} className="text-[10px] px-2 py-1 border rounded">{voiceField===field?"Stop":"Dictate"}</button><button type="button" onClick={()=>applyTerminology(field)} className="text-[10px] px-2 py-1 border rounded">Normalize</button></div></div><textarea value={form[field]} onChange={e=>setField(field,e.target.value)} className="w-full min-h-[64px] border rounded-lg p-2 text-sm" /></div>
        ))}
        {voiceStatus && <p className="text-[11px] text-gray-500">{voiceStatus}</p>}
        {detectedTerms.length>0 && <p className="text-[11px] text-gray-500">Recognized terms: {detectedTerms.map(t=>t.preferred||t.phrase).filter(Boolean).join(", ")}</p>}
        <button disabled={saving} onClick={save} className="w-full h-11 rounded-lg bg-[#c2183a] text-white text-sm font-medium disabled:opacity-50">{saving?"Saving…":"Confirm & Save"}</button>
        {message && <p className="text-xs text-green-700">{message}</p>}
      </section>
    </div>
  </AppShell>;
}
