"use client";

import { useEffect, useState } from "react";

export default function TelemedicineJoinPage() {
  const [token, setToken] = useState("");
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token")?.trim() || "";
    setToken(value);
    if (!value) { setError("This consultation link is missing its access token."); setLoading(false); return; }
    void (async () => {
      try {
        const r = await fetch(`/api/telemedicine/join?token=${encodeURIComponent(value)}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "This consultation link is no longer valid.");
        setSession(j.session);
      } catch (e) { setError(e instanceof Error ? e.message : "Unable to open consultation."); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center"><div className="text-sm text-gray-500">Preparing your consultation…</div></main>;
  if (error) return <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center"><section className="w-full max-w-lg rounded-2xl border bg-white p-6"><h1 className="text-xl font-bold">Consultation unavailable</h1><p className="mt-2 text-sm text-red-600">{error}</p></section></main>;

  const active = session?.status === "Active";
  const ended = ["Completed", "Cancelled", "Expired"].includes(session?.status);

  return <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-4"><div className="text-xs font-semibold tracking-wide text-[#c2183a]">MEDLUM</div><h1 className="mt-1 text-2xl font-bold">Your video consultation</h1><p className="mt-1 text-sm text-gray-500">Keep this page open while you wait for the doctor.</p></div>
      <div className="rounded-2xl border bg-white p-4 mb-3"><div className="flex items-center justify-between gap-3"><div><div className="font-semibold">Waiting room</div><div className="text-xs text-gray-500 mt-1">Status: {session?.status}</div></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs">{active ? "Doctor is in the room" : ended ? "Ended" : "Please wait"}</span></div></div>
      {active && session?.meetingUrl ? <section className="overflow-hidden rounded-2xl border bg-black"><div className="aspect-video w-full"><iframe title="MedLum video consultation" src={session.meetingUrl} allow="camera; microphone; fullscreen; display-capture; autoplay" className="h-full w-full border-0" /></div></section> : <section className="rounded-2xl border bg-white p-8 text-center"><div className="text-lg font-semibold">{ended ? "This consultation has ended." : "You're in the waiting room."}</div><p className="mt-2 text-sm text-gray-500">{ended ? "You can close this page." : "The doctor will start the consultation when ready. This page does not expose your clinical records."}</p>{!ended && <button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-[#140a1f] px-4 py-2.5 text-sm font-medium text-white">Check status</button>}</section>}
      <p className="mt-3 text-center text-[11px] text-gray-400">Video is provided through MedLum's configured video provider. Do not share this consultation link.</p>
    </section>
  </main>;
}
