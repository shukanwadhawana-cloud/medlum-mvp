"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { openConferenceInNewTab, warmConferenceOrigin } from "@/lib/telemedicine-client";
import { apiCreateEncounter, apiGetPatientDetail } from "@/lib/api";
import ClinicalAiAssistButton from "@/components/ClinicalAiAssistButton";

type ClinicalForm = {
  chiefComplaint: string;
  clinicalNotes: string;
  diagnosis: string;
  assessment: string;
  plan: string;
  followUpDate: string;
  bp: string;
  pulse: string;
  temperature: string;
  spo2: string;
  rr: string;
  weight: string;
  height: string;
};

const emptyForm = (): ClinicalForm => ({
  chiefComplaint: "",
  clinicalNotes: "",
  diagnosis: "",
  assessment: "",
  plan: "",
  followUpDate: "",
  bp: "",
  pulse: "",
  temperature: "",
  spo2: "",
  rr: "",
  weight: "",
  height: "",
});

function isAppleTouchDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function requestCameraMic() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot access camera/microphone.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  for (const t of stream.getTracks()) t.stop();
}

type SpeechRecognitionResultEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type SpeechRecognitionInstance = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: SpeechRecognitionResultEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

export default function TelemedicineConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [session, setSession] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [recentEncounters, setRecentEncounters] = useState<any[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [participants, setParticipants] = useState<any[]>([]);
  const [participantName, setParticipantName] = useState("");
  const [participantRole, setParticipantRole] = useState("Consultant");
  const [participantInviteLink, setParticipantInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [permHint, setPermHint] = useState("");
  const [isIos, setIsIos] = useState(false);
  const [form, setForm] = useState<ClinicalForm>(emptyForm);
  const [savedEncounterId, setSavedEncounterId] = useState("");
  const [aiDraftNotice, setAiDraftNotice] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  async function load(sessionId: string) {
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/telemedicine/sessions/${encodeURIComponent(sessionId)}`, { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Unable to load consultation.");
      setSession(j.session); void loadParticipants(sessionId);
      if (j.session?.patientId) {
        try {
          const detail = await apiGetPatientDetail(j.session.patientId);
          setPatient(detail.patient || detail);
          setRecentEncounters((Array.isArray(detail.encounters) ? detail.encounters : []).slice(0, 5));
        } catch { setPatient(null); setRecentEncounters([]); }
      } else { setPatient(null); setRecentEncounters([]); }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load consultation."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    setIsIos(isAppleTouchDevice());
    void params.then(({ id: value }) => { setId(value); void load(value); });
    return () => { try { recognitionRef.current?.stop(); } catch { /* ignore */ } };
  }, [params]);

  useEffect(() => { if (session?.meetingUrl) warmConferenceOrigin(session.meetingUrl); }, [session?.meetingUrl]);

  async function loadParticipants(sessionId: string) {
    try {
      const r = await fetch(`/api/telemedicine/sessions/${encodeURIComponent(sessionId)}/participants`, { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setParticipants(j.participants || []);
    } catch { /* supplementary */ }
  }

  async function inviteParticipant() {
    if (!id || !participantName.trim()) return;
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/telemedicine/sessions/${encodeURIComponent(id)}/participants`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: participantName.trim(), role: participantRole }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Unable to invite participant.");
      setParticipants((c) => [...c, j.participant]);
      setParticipantName("");
      setParticipantInviteLink(`${window.location.origin}/telemedicine/join?token=${encodeURIComponent(j.joinToken)}`);
      setMsg("Participant invitation created. Share the link below.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to invite participant."); }
    finally { setBusy(false); }
  }

  async function revokeParticipant(participantId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/telemedicine/sessions/${encodeURIComponent(id)}/participants?participantId=${encodeURIComponent(participantId)}`, { method: "DELETE", credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Unable to revoke participant.");
      setParticipants((c) => c.map((p) => (p.id === participantId ? j.participant : p)));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to revoke participant."); }
    finally { setBusy(false); }
  }

  async function patch(body: Record<string, unknown>) {
    if (!id) return null;
    const r = await fetch(`/api/telemedicine/sessions/${encodeURIComponent(id)}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Unable to update consultation.");
    setSession(j.session); return j;
  }

  async function enableDevices() {
    setPermHint(""); setError("");
    try { await requestCameraMic(); setMsg("Microphone and camera unlocked for this site."); }
    catch { setPermHint("Microphone blocked. Settings → Safari → Microphone → Allow."); }
  }

  function openVideoWithMic() {
    setError(""); setPermHint("");
    const url = session?.meetingUrl;
    if (!url) { setError("Video room is not ready yet."); return; }
    openConferenceInNewTab(url);
    void requestCameraMic().then(() => setMsg("Video opened in a new tab.")).catch(() => setPermHint("Allow Microphone when the browser asks."));
  }

  async function startCallForGuest() {
    setBusy(true); setError(""); setMsg("");
    try {
      try { await requestCameraMic(); } catch { /* continue */ }
      if (session?.status === "Scheduled") await patch({ status: "Waiting" });
      await patch({ status: "Active" });
      setMsg("Call is live for the guest.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to start call."); }
    finally { setBusy(false); }
  }

  async function hangUpOnly() {
    setBusy(true); setError("");
    try { await patch({ status: "Completed" }); setMsg("Call ended. Save clinical documentation below."); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to end call."); }
    finally { setBusy(false); }
  }

  async function makeInviteLink() {
    setBusy(true); setError(""); setCopied(false);
    try {
      const j = await patch({ regenerateJoinToken: true });
      if (!j?.joinToken) throw new Error("Could not create invite link.");
      setInviteLink(`${window.location.origin}/telemedicine/join?token=${encodeURIComponent(j.joinToken)}`);
      setMsg("Invite link ready.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create invite link."); }
    finally { setBusy(false); }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Clipboard blocked."); }
  }

  async function shareInvite() {
    if (!inviteLink) return;
    try {
      if (navigator.share) await navigator.share({ title: "MedLum video consultation", text: "Join the MedLum video call", url: inviteLink });
      else await copyInvite();
    } catch { /* cancelled */ }
  }

  function setField<K extends keyof ClinicalForm>(key: K, value: string) { setForm((f) => ({ ...f, [key]: value })); }

  function toggleDictation() {
    const SR = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition || (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    if (!SR) { setError("Speech dictation is not available in this browser."); return; }
    if (listening && recognitionRef.current) { recognitionRef.current.stop(); setListening(false); return; }
    const recognition = new SR();
    recognition.lang = "en-IN"; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      if (finalText) setForm((f) => ({ ...f, clinicalNotes: (f.clinicalNotes ? f.clinicalNotes + " " : "") + finalText.trim() }));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition; recognition.start(); setListening(true);
    setMsg("Listening… speak clinical notes. Review before saving.");
  }

  async function saveClinicalDocumentation(): Promise<string | null> {
    if (!session?.patientId) { setError("This session has no patient linked."); return null; }
    const hasContent = form.chiefComplaint.trim() || form.clinicalNotes.trim() || form.diagnosis.trim() || form.assessment.trim() || form.plan.trim();
    if (!hasContent) { setError("Enter clinical content before saving."); return null; }
    setSaving(true); setError("");
    try {
      const r = await apiCreateEncounter({
        patientId: session.patientId, appointmentId: session.appointmentId || undefined,
        date: new Date().toISOString().slice(0, 10),
        chiefComplaint: form.chiefComplaint, clinicalNotes: form.clinicalNotes, diagnosis: form.diagnosis,
        assessment: form.assessment, plan: form.plan, followUpDate: form.followUpDate || undefined,
        bp: form.bp, pulse: form.pulse, temperature: form.temperature, spo2: form.spo2, rr: form.rr, weight: form.weight, height: form.height,
      });
      if (!r.success || !r.encounter?.id) throw new Error(r.error || "Could not save clinical consultation.");
      setSavedEncounterId(r.encounter.id);
      setMsg("Clinical consultation saved. Review or complete.");
      return r.encounter.id as string;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); return null; }
    finally { setSaving(false); }
  }

  async function completeConsultation() {
    setBusy(true); setError(""); setMsg("");
    try {
      let encounterId = savedEncounterId;
      if (!encounterId) { encounterId = (await saveClinicalDocumentation()) || ""; if (!encounterId) return; }
      if (session?.status !== "Completed" && session?.status !== "Cancelled" && session?.status !== "Expired") await patch({ status: "Completed" });
      setMsg("Consultation completed.");
      if (session?.patientId) router.push(`/patients/${session.patientId}/chart`);
      else router.push("/telemedicine");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not complete."); }
    finally { setBusy(false); }
  }

  if (loading) return <AppShell><div className="text-sm text-gray-500">Loading consultation…</div></AppShell>;
  if (error && !session) return <AppShell><div className="rounded-xl bg-white p-4 text-sm text-red-600">{error}</div></AppShell>;

  const canJoin = session?.status !== "Completed" && session?.status !== "Cancelled" && session?.status !== "Expired";
  const active = session?.status === "Active";
  const patientName = patient?.name || "Patient";

  return (
    <AppShell>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/telemedicine" className="text-xs text-[#c2183a]">← Telemedicine</Link>
          <h1 className="mt-1 text-xl font-bold sm:text-2xl">MedLum consultation</h1>
          <p className="text-sm text-gray-500">Video + clinical documentation. Save the encounter, then complete.</p>
        </div>
        <span className="self-start rounded-full bg-gray-100 px-3 py-1 text-xs">{session?.status}</span>
      </div>
      {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</div>}
      {permHint && <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{permHint}</div>}

      {session?.patientId && (
        <section className="mb-3 rounded-2xl border bg-white p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{patientName}</div>
              <p className="text-xs text-gray-500">{[patient?.age != null ? `${patient.age}y` : null, patient?.gender, patient?.phone].filter(Boolean).join(" · ") || "Linked patient"}{session.appointmentId ? " · Appointment linked" : ""}</p>
              {patient?.allergies ? <p className="mt-1 text-xs text-red-700">Allergies: {patient.allergies}</p> : null}
            </div>
            <Link href={`/patients/${session.patientId}/chart`} className="text-xs font-medium text-[#c2183a]">Open chart</Link>
          </div>
          {recentEncounters.length > 0 && (
            <div className="mt-3 border-t pt-2">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Recent consultations</p>
              <ul className="mt-1 space-y-1">{recentEncounters.map((e) => <li key={e.id} className="text-xs text-gray-600">{e.date || ""} — {e.diagnosis || e.chiefComplaint || "Consultation"}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      <section className="mb-3 rounded-2xl border bg-white p-3 sm:p-4">
        <div className="text-sm font-semibold">Video session</div>
        <div className="mt-1 text-xs text-gray-500">{session?.sessionKind === "peer" ? "Peer consultation" : "Patient consultation"}{session?.peerLabel ? ` · ${session.peerLabel}` : ""}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {canJoin && <button type="button" disabled={busy} onClick={() => void startCallForGuest()} className="rounded-xl bg-[#140a1f] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{active ? "Call live" : "Start call for guest"}</button>}
          {canJoin && session?.meetingUrl && <button type="button" onClick={() => openVideoWithMic()} className="rounded-xl border px-3 py-2 text-xs font-medium">Join video (new tab)</button>}
          {canJoin && <button type="button" disabled={busy} onClick={() => void hangUpOnly()} className="rounded-xl border px-3 py-2 text-xs font-medium disabled:opacity-50">End call only</button>}
          <button type="button" onClick={() => void enableDevices()} className="rounded-xl border px-3 py-2 text-xs font-medium">Unlock mic/camera</button>
        </div>
        {isIos && <p className="mt-2 text-[11px] text-gray-500">On iPhone/iPad, allow Microphone for this site if prompted.</p>}
      </section>

      <section className="mb-3 rounded-2xl border bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Clinical documentation</div>
            <p className="text-xs text-gray-500">Same MedLum encounter fields as OPD. Review before save.</p>
          </div>
          {session?.patientId && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => toggleDictation()} className={`rounded-xl px-3 py-2 text-xs font-medium ${listening ? "bg-red-600 text-white" : "border"}`}>{listening ? "Stop dictation" : "Dictate notes"}</button>
              <ClinicalAiAssistButton
                sourceText={[form.chiefComplaint, form.clinicalNotes, form.assessment, form.diagnosis, form.plan].map((x) => String(x || "").trim()).filter(Boolean).join("\n")}
                age={patient?.age}
                gender={patient?.gender}
                disabled={listening}
                onError={(m) => setError(m)}
                onDraft={(d, meta) => {
                  setForm((f) => ({ ...f, chiefComplaint: d.chiefComplaint || f.chiefComplaint, clinicalNotes: d.clinicalNotes || f.clinicalNotes, diagnosis: d.diagnosis || f.diagnosis, assessment: d.assessment || f.assessment, plan: d.plan || f.plan }));
                  setAiDraftNotice(meta.notice || `AI DRAFT applied (${meta.source}). Review before saving.`);
                  setMsg("AI draft ready for review.");
                }}
              />
            </div>
          )}
        </div>
        {!session?.patientId ? (
          <p className="mt-3 text-sm text-amber-800">Peer sessions have no patient chart.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div><label className="text-[11px] text-gray-500">Chief complaint</label><input value={form.chiefComplaint} onChange={(e) => setField("chiefComplaint", e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Main reason for visit" /></div>
            <div><label className="text-[11px] text-gray-500">Clinical notes / history</label><textarea value={form.clinicalNotes} onChange={(e) => setField("clinicalNotes", e.target.value)} className="mt-1 min-h-[100px] w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="History, examination findings…" /></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([["bp", "BP"], ["pulse", "Pulse"], ["rr", "RR"], ["temperature", "Temp"], ["spo2", "SpO2"], ["weight", "Weight"], ["height", "Height"]] as Array<[keyof ClinicalForm, string]>).map(([key, label]) => (
                <div key={key}><label className="text-[11px] text-gray-500">{label}</label><input value={form[key]} onChange={(e) => setField(key, e.target.value)} className="mt-1 w-full rounded-xl border px-2 py-2 text-sm" /></div>
              ))}
            </div>
            <div><label className="text-[11px] text-gray-500">Diagnosis</label><input value={form.diagnosis} onChange={(e) => setField("diagnosis", e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" /></div>
            <div><label className="text-[11px] text-gray-500">Assessment</label><textarea value={form.assessment} onChange={(e) => setField("assessment", e.target.value)} className="mt-1 min-h-[72px] w-full rounded-xl border px-3 py-2.5 text-sm" /></div>
            <div><label className="text-[11px] text-gray-500">Plan</label><textarea value={form.plan} onChange={(e) => setField("plan", e.target.value)} className="mt-1 min-h-[72px] w-full rounded-xl border px-3 py-2.5 text-sm" /></div>
            <div><label className="text-[11px] text-gray-500">Follow-up date</label><input type="date" value={form.followUpDate} onChange={(e) => setField("followUpDate", e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm sm:max-w-xs" /></div>
            {aiDraftNotice && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{aiDraftNotice}</p>}
            <p className="text-[10px] text-gray-400">Dictated, typed, or AI-assisted content is a drafting aid only. ClinicalNote remains DRAFT until chart signing. AI does not sign, prescribe, or place orders.</p>
            {savedEncounterId && <p className="text-xs text-green-700">Encounter saved ({savedEncounterId.slice(0, 8)}…).</p>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" disabled={saving || busy || !session?.patientId} onClick={() => void saveClinicalDocumentation()} className="rounded-xl border px-4 py-2.5 text-sm font-medium disabled:opacity-50">{saving ? "Saving…" : "Save clinical consultation"}</button>
              <button type="button" disabled={saving || busy || !session?.patientId} onClick={() => void completeConsultation()} className="rounded-xl bg-[#c2183a] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Completing…" : "Complete consultation"}</button>
            </div>
          </div>
        )}
      </section>

      <section className="mb-3 rounded-2xl border bg-white p-3 sm:p-4">
        <div className="text-sm font-semibold">Guest invite</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void makeInviteLink()} className="rounded-xl border px-3 py-2 text-xs font-medium disabled:opacity-50">Create invite link</button>
          {inviteLink && (<><button type="button" onClick={() => void copyInvite()} className="rounded-xl border px-3 py-2 text-xs font-medium">{copied ? "Copied" : "Copy link"}</button><button type="button" onClick={() => void shareInvite()} className="rounded-xl border px-3 py-2 text-xs font-medium">Share</button></>)}
        </div>
        {inviteLink && <p className="mt-2 break-all text-xs text-gray-600">{inviteLink}</p>}
      </section>

      <section className="mb-6 rounded-2xl border bg-white p-3 sm:p-4">
        <div className="text-sm font-semibold">Additional participants</div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input value={participantName} onChange={(e) => setParticipantName(e.target.value)} placeholder="Name" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" />
          <select value={participantRole} onChange={(e) => setParticipantRole(e.target.value)} className="rounded-xl border px-3 py-2 text-sm"><option>Consultant</option><option>Doctor</option><option>Nurse</option><option>Observer</option></select>
          <button type="button" disabled={busy || !participantName.trim()} onClick={() => void inviteParticipant()} className="rounded-xl bg-[#140a1f] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Invite</button>
        </div>
        {participantInviteLink && <p className="mt-2 break-all text-xs text-gray-600">{participantInviteLink}</p>}
        <ul className="mt-3 space-y-2">{participants.map((p) => (<li key={p.id} className="flex items-center justify-between gap-2 text-sm"><span>{p.name} · {p.role} · {p.status}</span>{p.status !== "Revoked" && <button type="button" className="text-xs text-[#c2183a]" onClick={() => void revokeParticipant(p.id)}>Revoke</button>}</li>))}</ul>
      </section>
    </AppShell>
  );
}
