"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import JitsiMeeting from "@/components/JitsiMeeting";

export default function TelemedicineVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(sessionId: string) {
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/telemedicine/sessions/${encodeURIComponent(sessionId)}`, { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Unable to load consultation.");
      setSession(j.session);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load consultation."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void params.then(({ id: value }) => { setId(value); void load(value); }); }, [params]);

  async function update(status: "Waiting" | "Active" | "Completed" | "Cancelled") {
    if (!id) return;
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/telemedicine/sessions/${encodeURIComponent(id)}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Unable to update consultation.");
      setSession(j.session);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update consultation."); }
    finally { setBusy(false); }
  }

  if (loading) return <AppShell><div className="text-sm text-gray-500">Loading video consultation…</div></AppShell>;
  if (error && !session) return <AppShell><div className="rounded-xl bg-white p-4 text-sm text-red-600">{error}</div></AppShell>;

  const canJoin = session?.status !== "Completed" && session?.status !== "Cancelled" && session?.status !== "Expired";
  const active = session?.status === "Active";
  const jitsi = session?.provider === "jitsi" && Boolean(session?.meetingUrl);

  return <AppShell>
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div><Link href="/dashboard" className="text-xs text-[#c2183a]">← Dashboard</Link><h1 className="mt-1 text-xl sm:text-2xl font-bold">Video consultation</h1><p className="text-sm text-gray-500">Waiting room → video → consultation → completion.</p></div>
      <span className="self-start rounded-full bg-gray-100 px-3 py-1 text-xs">{session?.status}</span>
    </div>
    {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

    <section className="rounded-2xl border bg-white p-3 sm:p-4 mb-3">
      <div className="text-sm font-semibold">Consultation room</div>
      <div className="mt-1 text-xs text-gray-500 break-all">Provider: {session?.provider || "external"} · Session: {session?.id}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {session?.status === "Scheduled" && <button disabled={busy} onClick={() => update("Waiting")} className="rounded-xl border px-3.5 py-2.5 text-sm font-medium">Open waiting room</button>}
        {session?.status === "Waiting" && <button disabled={busy} onClick={() => update("Active")} className="rounded-xl bg-[#140a1f] px-3.5 py-2.5 text-sm font-medium text-white">Start consultation</button>}
        {active && <button disabled={busy} onClick={() => update("Completed")} className="rounded-xl border px-3.5 py-2.5 text-sm font-medium">Complete consultation</button>}
        {canJoin && session?.meetingUrl && <a href={session.meetingUrl} target="_blank" rel="noreferrer" className="rounded-xl border px-3.5 py-2.5 text-sm font-medium">Open video in new tab</a>}
        {canJoin && session?.meetingUrl && <a href={`/telemedicine/${encodeURIComponent(session.id)}`} className="rounded-xl border px-3.5 py-2.5 text-sm">Refresh room</a>}
      </div>
    </section>

    {canJoin && jitsi ? <section className="overflow-hidden rounded-2xl border bg-black">
      <div className="telemedicine-video-frame w-full"><JitsiMeeting meetingUrl={session.meetingUrl} displayName="MedLum Doctor" /></div>
    </section> : canJoin && session?.meetingUrl ? <section className="overflow-hidden rounded-2xl border bg-black">
      <div className="telemedicine-video-frame w-full"><iframe title="MedLum external video consultation" src={session.meetingUrl} allow="camera; microphone; fullscreen; display-capture; autoplay" className="h-full w-full border-0" /></div>
    </section> : <section className="rounded-2xl border bg-white p-6 text-center"><div className="text-sm font-medium">Video room unavailable</div><p className="mt-1 text-xs text-gray-500">This session is configured for an external video provider or is no longer joinable.</p></section>}
  </AppShell>;
}
