"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

function defaultLocalDateTime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function TelemedicinePage() {
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [patientId, setPatientId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultLocalDateTime);
  const [lastJoinLink, setLastJoinLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const patientNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patients) m.set(p.id, p.name || p.id);
    return m;
  }, [patients]);

  async function load() {
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const [p, s] = await Promise.all([
        fetch("/api/patients", { credentials: "include", cache: "no-store" }),
        fetch("/api/telemedicine/sessions", { credentials: "include", cache: "no-store" }),
      ]);
      const pj = await p.json().catch(() => ({}));
      const sj = await s.json().catch(() => ({}));

      if (p.ok) {
        setPatients(Array.isArray(pj.patients) ? pj.patients : []);
      } else {
        setPatients([]);
        setError(pj.error || "Unable to load patients. Sign in again if this persists.");
      }

      if (s.ok) {
        setSessions(Array.isArray(sj.sessions) ? sj.sessions : []);
      } else {
        setSessions([]);
        const sessionsMsg = sj.error || "Unable to load video sessions.";
        // Keep patients usable even when sessions fail (e.g. migration not applied yet).
        setWarning(sessionsMsg + (sj.hint ? ` ${sj.hint}` : ""));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load video consultations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && doctor) void load();
  }, [authLoading, doctor]);

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) {
      setError("Select a patient before creating a video consultation.");
      return;
    }
    setSaving(true);
    setError("");
    setWarning("");
    setLastJoinLink("");
    try {
      const when = scheduledAt ? new Date(scheduledAt) : new Date();
      if (Number.isNaN(when.getTime())) throw new Error("Pick a valid date and time.");
      const r = await fetch("/api/telemedicine/sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, scheduledAt: when.toISOString() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || j.hint || "Unable to create video session.");
      if (!j.joinToken) throw new Error("Session created but join token was missing. Refresh and try again.");
      const link = `${window.location.origin}/telemedicine/join?token=${encodeURIComponent(j.joinToken)}`;
      setLastJoinLink(link);
      setPatientId("");
      setScheduledAt(defaultLocalDateTime());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create video session.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!lastJoinLink) return;
    try {
      await navigator.clipboard?.writeText(lastJoinLink);
    } catch {
      /* ignore */
    }
  }

  if (authLoading || !doctor) {
    return (
      <AppShell>
        <div className="text-sm text-gray-500">Loading telemedicine…</div>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell>
        <div className="text-sm text-gray-500">Loading patients and video sessions…</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4">
        <Link href="/dashboard" className="text-xs text-[#c2183a]">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-xl font-bold">Telemedicine</h1>
        <p className="text-sm text-gray-500">
          Select a patient, create a session, share the patient link, then open the room and start the Jitsi video call.
        </p>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {warning && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</div>
      )}

      {lastJoinLink && (
        <section className="mb-3 rounded-2xl border border-green-200 bg-green-50 p-4">
          <div className="font-semibold text-green-800">Patient link ready</div>
          <p className="mt-1 text-xs text-green-700">
            Share this link with the patient. They join the waiting room from their phone or browser — no consultant
            picker is required on this screen; you are the host when you open the room.
          </p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={lastJoinLink} className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 text-xs" />
            <button type="button" onClick={copyLink} className="rounded-xl bg-[#140a1f] px-4 py-2 text-xs font-medium text-white">
              Copy
            </button>
          </div>
        </section>
      )}

      <section className="mb-3 rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">New video consultation</h2>
        <p className="mt-1 text-xs text-gray-500">
          You do not select another consultant here — the logged-in doctor is the host. Choose the patient from your
          clinic list.
        </p>
        {patients.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed p-4 text-sm text-gray-600">
            No patients found for your account/clinic. Register a patient from{" "}
            <Link href="/patients" className="text-[#c2183a] font-medium">
              Patients
            </Link>{" "}
            or IPD first, then return here.
          </div>
        ) : (
          <form onSubmit={createSession} className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              required
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="rounded-xl border px-3 py-2.5 text-sm"
            >
              <option value="">Select patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.phone || "no phone"}
                </option>
              ))}
            </select>
            <input
              required
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="rounded-xl border px-3 py-2.5 text-sm"
            />
            <button
              disabled={saving || !patientId}
              className="rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-medium text-white sm:col-span-2 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create video consultation"}
            </button>
          </form>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 font-semibold">Video sessions</div>
        <div className="divide-y">
          {sessions.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No video sessions yet. Create one above after selecting a patient.</div>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-medium">{patientNameById.get(s.patientId) || `Patient ${s.patientId}`}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(s.scheduledAt).toLocaleString()} · {s.status} · {s.provider}
                    {s.meetingUrl ? " · Jitsi ready" : ""}
                  </div>
                </div>
                <Link
                  href={`/telemedicine/${encodeURIComponent(s.id)}`}
                  className="rounded-xl border px-3 py-2 text-xs font-medium"
                >
                  Open room
                </Link>
              </div>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
