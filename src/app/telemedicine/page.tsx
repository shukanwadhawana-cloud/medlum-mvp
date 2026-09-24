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
  const [mode, setMode] = useState<"patient" | "peer">("patient");
  const [patientId, setPatientId] = useState("");
  const [peerLabel, setPeerLabel] = useState("");
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

      if (p.ok) setPatients(Array.isArray(pj.patients) ? pj.patients : []);
      else {
        setPatients([]);
        setError(pj.error || "Unable to load patients. Sign in again if this persists.");
      }

      if (s.ok) setSessions(Array.isArray(sj.sessions) ? sj.sessions : []);
      else {
        setSessions([]);
        setWarning((sj.error || "Unable to load video sessions.") + (sj.hint ? ` ${sj.hint}` : ""));
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
    if (mode === "patient" && !patientId) {
      setError("Select a patient, or switch to Consultant peer call.");
      return;
    }
    setSaving(true);
    setError("");
    setWarning("");
    setLastJoinLink("");
    try {
      const when = scheduledAt ? new Date(scheduledAt) : new Date();
      if (Number.isNaN(when.getTime())) throw new Error("Pick a valid date and time.");
      const body =
        mode === "peer"
          ? {
              sessionKind: "peer",
              peerLabel: peerLabel.trim() || "Consultant peer call",
              scheduledAt: when.toISOString(),
            }
          : { sessionKind: "patient", patientId, scheduledAt: when.toISOString() };
      const r = await fetch("/api/telemedicine/sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || j.hint || "Unable to create video session.");
      if (!j.joinToken) throw new Error("Session created but join token was missing. Refresh and try again.");
      const link = `${window.location.origin}/telemedicine/join?token=${encodeURIComponent(j.joinToken)}`;
      setLastJoinLink(link);
      setPatientId("");
      setPeerLabel("");
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
          Patient visits or consultant-to-consultant peer calls (e.g. iPhone ↔ iPad). Host opens the room; the other
          person uses the join link.
        </p>
      </div>

      {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {warning && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</div>
      )}

      {lastJoinLink && (
        <section className="mb-3 rounded-2xl border border-green-200 bg-green-50 p-4">
          <div className="font-semibold text-green-800">Join link ready</div>
          <p className="mt-1 text-xs text-green-700">
            Send this link to the patient or the other consultant. On your device open <strong>Open room</strong>, set
            Waiting → Start consultation. The other device only needs this link — no second MedLum login required.
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
        <h2 className="font-semibold">New video session</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("patient")}
            className={`h-9 rounded-full px-3 text-xs font-medium border ${mode === "patient" ? "bg-[#140a1f] text-white border-[#140a1f]" : "bg-white"}`}
          >
            Patient consultation
          </button>
          <button
            type="button"
            onClick={() => setMode("peer")}
            className={`h-9 rounded-full px-3 text-xs font-medium border ${mode === "peer" ? "bg-[#140a1f] text-white border-[#140a1f]" : "bg-white"}`}
          >
            Consultant peer call (no patient)
          </button>
        </div>

        <form onSubmit={createSession} className="mt-3 grid gap-2 sm:grid-cols-2">
          {mode === "patient" ? (
            patients.length === 0 ? (
              <div className="sm:col-span-2 rounded-xl border border-dashed p-4 text-sm text-gray-600">
                No patients in your clinic list yet. Register one under{" "}
                <Link href="/patients" className="font-medium text-[#c2183a]">
                  Patients
                </Link>{" "}
                / IPD, or use <strong>Consultant peer call</strong> to talk doctor-to-doctor without a patient.
              </div>
            ) : (
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
            )
          ) : (
            <input
              value={peerLabel}
              onChange={(e) => setPeerLabel(e.target.value)}
              placeholder="Optional label (e.g. Dr. Sharma on iPad)"
              className="rounded-xl border px-3 py-2.5 text-sm"
            />
          )}

          <input
            required
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="rounded-xl border px-3 py-2.5 text-sm"
          />

          <button
            disabled={saving || (mode === "patient" && !patientId)}
            className="rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-medium text-white sm:col-span-2 disabled:opacity-50"
          >
            {saving ? "Creating…" : mode === "peer" ? "Create consultant peer call" : "Create patient consultation"}
          </button>
        </form>

        {mode === "peer" && (
          <p className="mt-2 text-[11px] text-gray-500">
            Example: log in on iPhone as host → create peer call → open room. On iPad open the join link (no second
            account required). Both join the same video room when the host starts the consultation.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4 py-3 font-semibold">Video sessions</div>
        <div className="divide-y">
          {sessions.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No video sessions yet.</div>
          ) : (
            sessions.map((s) => {
              const title =
                s.sessionKind === "peer"
                  ? s.peerLabel || "Consultant peer call"
                  : patientNameById.get(s.patientId) || (s.patientId ? `Patient ${s.patientId}` : "Session");
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-medium">{title}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(s.scheduledAt).toLocaleString()} · {s.status} · {s.sessionKind || "patient"} ·{" "}
                      {s.provider}
                      {s.meetingUrl ? " · Video ready" : ""}
                    </div>
                  </div>
                  <Link
                    href={`/telemedicine/${encodeURIComponent(s.id)}`}
                    className="rounded-xl border px-3 py-2 text-xs font-medium"
                  >
                    Open room
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </section>
    </AppShell>
  );
}
