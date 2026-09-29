"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDoctor } from "@/components/DoctorProvider";
import { canAccessModule } from "@/lib/permissions";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { apiAddPatient, apiAddPrescriptionWithEncounter, apiCreateEncounter, apiGetPatientDetail, apiGetPatients } from "@/lib/api";
import { detectClinicalTerms, normalizeClinicalText, type ClinicalTerm } from "@/lib/clinical/terminology";
import ClinicalAiDraftPanel from "@/components/ClinicalAiDraftPanel";

type Patient = { id: string; name: string; age: number; gender: string; phone: string; bp?: string; allergies?: string };
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    SpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

async function runOcr(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/clinical-ai/ocr", {
    method: "POST",
    credentials: "include",
    headers: { "X-MedLum-Requested-With": "MedLum" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Document OCR could not be completed.");
  }
  return String(payload.text || "").trim();
}

export default function ClinicalAssistPage() {
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [mode, setMode] = useState<"new" | "followup">("new");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [scanText, setScanText] = useState("");
  const [scanConfidence, setScanConfidence] = useState<number | null>(null);
  const [voiceField, setVoiceField] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    name: "",
    age: "",
    gender: "Male",
    phone: "",
    bp: "",
    allergies: "",
    chiefComplaint: "",
    clinicalNotes: "",
    diagnosis: "",
    assessment: "",
    plan: "",
    medicines: "",
    advice: "",
  });

  useEffect(() => {
    if (!authLoading && doctor && canAccessModule(doctor.primaryRole, "clinical_assist")) {
      apiGetPatients().then((x) => setPatients(x as Patient[]));
    }
  }, [authLoading, doctor]);

  useEffect(() => {
    const initialPatientId = new URLSearchParams(window.location.search).get("patientId") || "";
    if (initialPatientId) {
      setPatientId(initialPatientId);
      setMode("followup");
    }
  }, []);

  useEffect(() => {
    if (!patientId) return;
    apiGetPatientDetail(patientId).then((detail: any) => {
      if (!detail?.patient) return;
      const p = detail.patient;
      setForm((f) => ({
        ...f,
        name: p.name || f.name,
        age: String(p.age ?? f.age),
        gender: p.gender || f.gender,
        phone: p.phone || f.phone,
        bp: p.bp || f.bp,
        allergies: p.allergies || f.allergies,
      }));
    });
  }, [patientId]);

  const selected = useMemo(() => patients.find((p) => p.id === patientId) || null, [patients, patientId]);

  function applyAiDraft(sections: {
    history?: string;
    examination?: string;
    assessment?: string;
    plan?: string;
    combined?: string;
  }) {
    setForm((f) => ({
      ...f,
      clinicalNotes: sections.history || sections.combined || f.clinicalNotes,
      assessment: sections.assessment || f.assessment,
      plan: sections.plan || f.plan,
      chiefComplaint: sections.examination || f.chiefComplaint,
    }));
    setMessage("AI draft applied to the form. Review and edit before saving.");
  }

  async function scan(file: File) {
    setScanBusy(true);
    setError("");
    setScanStatus("Uploading document for OCR…");
    try {
      const best = await runOcr(file);
      setScanText(best);
      setScanConfidence(null);
      setScanStatus("OCR completed on MedLum server. Review the extracted text and fields carefully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Document OCR could not complete on this device.");
      setScanStatus("");
    } finally {
      setScanBusy(false);
    }
  }

  function startVoice(field: keyof typeof form) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Voice dictation is not supported in this browser.");
      return;
    }
    if (voiceField === field) {
      recognitionRef.current?.stop();
      setVoiceField(null);
      setVoiceStatus("");
      return;
    }
    recognitionRef.current?.stop();
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-IN";
    r.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const normalized = normalizeClinicalText(transcript);
      setForm((f) => ({ ...f, [field]: (f[field] + " " + normalized).trim() }));
    };
    r.onerror = () => setVoiceStatus("Voice recognition error");
    r.onend = () => {
      setVoiceField(null);
      setVoiceStatus("");
    };
    recognitionRef.current = r;
    r.start();
    setVoiceField(field);
    setVoiceStatus("Listening…");
  }

  async function saveNote() {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      let pid = patientId;
      if (mode === "new") {
        if (!form.name.trim() || !form.age) throw new Error("Name and age are required");
        const created = await apiAddPatient({
          name: form.name.trim(),
          age: Number(form.age),
          gender: form.gender,
          phone: form.phone.trim(),
          bp: form.bp,
          allergies: form.allergies,
        });
        if (!(created as any)?.id) throw new Error((created as any)?.error || "Could not create patient");
        pid = (created as any).id;
        setPatientId(pid);
      }
      if (!pid) throw new Error("Select or create a patient first");
      const notes = [form.chiefComplaint, form.clinicalNotes, form.diagnosis, form.assessment, form.plan, form.advice]
        .filter(Boolean)
        .join("\n\n");
      await apiCreateEncounter({
        patientId: pid,
        bp: form.bp,
        notes,
        diagnosis: form.diagnosis,
      } as any);
      if (form.medicines.trim()) {
        await apiAddPrescriptionWithEncounter({
          patientId: pid,
          medicines: form.medicines.trim(),
          advice: form.advice,
        } as any);
      }
      setMessage("Clinical documentation saved. Use Clinical Notes workflow to finalize and sign when ready.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <AppShell><p className="text-sm text-gray-500">Loading…</p></AppShell>;
  if (!doctor || !canAccessModule(doctor.primaryRole, "clinical_assist")) {
    return (
      <AppShell>
        <p className="text-sm text-red-600">Your role cannot access Clinical Assist.</p>
        <Link href="/dashboard" className="text-xs text-[#c2183a]">← Dashboard</Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4">
        <Link href="/dashboard" className="text-xs text-[#c2183a]">← Dashboard</Link>
        <h1 className="mt-1 text-xl font-semibold">Clinical Assist</h1>
        <p className="text-xs text-gray-500">Draft clinical documentation with optional OCR and AI assist. Nothing is finalized until you save and sign through the normal workflow.</p>
      </div>
      {message && <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}
      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="bg-white border rounded-xl p-3 mb-3">
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setMode("new")} className={`px-3 py-1.5 rounded-lg text-xs ${mode === "new" ? "bg-[#c2183a] text-white" : "border"}`}>New patient</button>
          <button type="button" onClick={() => setMode("followup")} className={`px-3 py-1.5 rounded-lg text-xs ${mode === "followup" ? "bg-[#c2183a] text-white" : "border"}`}>Existing patient</button>
        </div>
        {mode === "followup" && (
          <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className="w-full h-10 border rounded-lg px-2 text-sm">
            <option value="">Select patient…</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.age}{p.gender?.[0]} · {p.phone}</option>
            ))}
          </select>
        )}
        {mode === "new" && (
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 border rounded-lg px-2 text-sm" />
            <input placeholder="Age" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} className="h-10 border rounded-lg px-2 text-sm" />
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="h-10 border rounded-lg px-2 text-sm">
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10 border rounded-lg px-2 text-sm" />
          </div>
        )}
      </section>

      <section className="bg-white border rounded-xl p-3 mb-3">
        <h3 className="font-semibold text-sm">Document scanner + OCR</h3>
        <p className="text-[11px] text-gray-500 mt-1">Upload a clear photo or PDF. Prefer JPG/PNG/PDF (not HEIC). OCR is a drafting aid only.</p>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) scan(f);
          }}
          className="mt-3 w-full text-xs"
        />
        {scanBusy && <p className="text-xs text-gray-500 mt-2">{scanStatus}</p>}
        {scanStatus && !scanBusy && <p className="text-xs text-green-700 mt-2">{scanStatus}</p>}
        {scanText && (
          <details className="mt-2" open>
            <summary className="text-xs font-medium">Review extracted OCR text</summary>
            <textarea value={scanText} onChange={(e) => setScanText(e.target.value)} className="w-full mt-2 min-h-36 border rounded-lg p-2 text-xs" />
          </details>
        )}
      </section>

      {patientId && (
        <ClinicalAiDraftPanel
          patientId={patientId}
          onApply={applyAiDraft}
        />
      )}

      <section className="bg-white border rounded-xl p-3 mb-3 space-y-2">
        <h3 className="font-semibold text-sm">Clinical note draft</h3>
        {(["bp", "allergies", "chiefComplaint", "clinicalNotes", "diagnosis", "assessment", "plan", "medicines", "advice"] as const).map((field) => (
          <div key={field}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium capitalize">{field.replace(/([A-Z])/g, " $1")}</label>
              <button type="button" onClick={() => startVoice(field)} className="text-[10px] text-[#c2183a]">{voiceField === field ? "Stop" : "Voice"}</button>
            </div>
            <textarea
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              className="w-full mt-1 min-h-16 border rounded-lg p-2 text-sm"
            />
          </div>
        ))}
        {voiceStatus && <p className="text-xs text-gray-500">{voiceStatus}</p>}
        <button type="button" disabled={saving} onClick={saveNote} className="w-full h-11 rounded-xl bg-[#c2183a] text-white text-sm font-medium disabled:opacity-50">
          {saving ? "Saving…" : "Save clinical draft"}
        </button>
      </section>
    </AppShell>
  );
}
