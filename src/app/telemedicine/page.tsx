"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

export default function TelemedicinePage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [patientId, setPatientId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [lastJoinLink, setLastJoinLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [p, s] = await Promise.all([
        fetch("/api/patients", { credentials: "include", cache: "no-store" }),
        fetch("/api/telemedicine/sessions", { credentials: "include", cache: "no-store" }),
      ]);
      const pj = await p.json().catch(() => ({}));
      const sj = await s.json().catch(() => ({}));
      if (!p.ok) throw new Error(pj.error || "Unable to load patients.");
      if (!s.ok) throw new Error(sj.error || "Unable to load video sessions.");
      setPatients(pj.patients || []); setSessions(sj.sessions || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load video sessions."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function createSession(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setLastJoinLink("");
    try {
      const r = await fetch("/api/telemedicine/sessions", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId, scheduledAt: new Date(scheduledAt).toISOString() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Unable to create video session.");
      const link = `${window.location.origin}/telemedicine/join?token=${encodeURIComponent(j.joinToken)}`;
      setLastJoinLink(link); setPatientId(""); setScheduledAt(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create video session."); }
    finally { setSaving(false); }
  }

  async function copyLink() {
    if (!lastJoinLink) return;
    await navigator.clipboard?.writeText(lastJoinLink);
  }

  if (loading) return <AppShell><div className="text-sm text-gray-500">Loading telemedicine…</div></AppShell>;

  return <AppShell>
    <div className="mb-4"><Link href="/dashboard" className="text-xs text-[#c2183a]">← Dashboard</Link><h1 className="mt-1 text-xl font-bold">Telemedicine</h1><p className="text-sm text-gray-500">Create a session, send the secure patient link, open the video room and complete the consultation.</p></div>
    {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {lastJoinLink && <section className="mb-3 rounded-2xl border border-green-200 bg-green-50 p-4"><div className="font-semibold text-green-800">Patient link ready</div><p className="mt-1 text-xs text-green-700">For the first live test, open this link on a second browser/device and join as the patient/test participant. No separate video app is required.</p><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input readOnly value={lastJoinLink} className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 text-xs"/><div className="flex gap-2"><button onClick={copyLink} className="rounded-xl bg-[#140a1f] px-4 py-2 text-xs font-medium text-white">Copy</button><a href={lastJoinLink} target="_blank" rel="noreferrer" className="rounded-xl border border-green-300 bg-white px-4 py-2 text-xs font-medium text-green-800">Open test view</a></div></div></section>}

    <section className="rounded-2xl border bg-white p-4 mb-3"><h2 className="font-semibold">New video consultation</h2><form onSubmit={createSession} className="mt-3 grid gap-2 sm:grid-cols-2"><select required value={patientId} onChange={e => setPatientId(e.target.value)} className="rounded-xl border px-3 py-2.5 text-sm"><option value="">Select patient</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name} · {p.phone}</option>)}</select><input required type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="rounded-xl border px-3 py-2.5 text-sm"/><button disabled={saving} className="rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-medium text-white sm:col-span-2">{saving ? "Creating…" : "Create video consultation"}</button></form></section>

    <section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b px-4 py-3 font-semibold">Video sessions</div><div className="divide-y">{sessions.length === 0 ? <div className="p-6 text-sm text-gray-500">No video sessions yet.</div> : sessions.map(s => <div key={s.id} className="p-4 flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium">Patient {s.patientId}</div><div className="text-xs text-gray-500">{new Date(s.scheduledAt).toLocaleString()} · {s.status} · {s.provider}</div></div><Link href={`/telemedicine/${encodeURIComponent(s.id)}`} className="rounded-xl border px-3 py-2 text-xs font-medium">Open room</Link></div>)}</div></section>
  </AppShell>;
}
