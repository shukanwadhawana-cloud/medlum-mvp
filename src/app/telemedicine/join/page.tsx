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
    if (!value) {
      setError("This consultation link is missing its access token.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/telemedicine/join?token=${encodeURIComponent(value)}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "This consultation link is no longer valid.");
        if (!cancelled) setSession(j.session);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to open consultation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    // Poll faster while waiting so guest sees Active / video quickly after host starts.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4 sm:p-6">
        <div className="text-sm text-gray-500">Preparing your consultation…</div>
      </main>
    );
  }
  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4 sm:p-6">
        <section className="w-full max-w-lg rounded-2xl border bg-white p-5 sm:p-6">
          <h1 className="text-xl font-bold">Consultation unavailable</h1>
          <p className="mt-2 break-words text-sm text-red-600">{error}</p>
        </section>
      </main>
    );
  }

  const active = session?.status === "Active";
  const ended = ["Completed", "Cancelled", "Expired"].includes(session?.status);

  return (
    <main className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <section className="mx-auto w-full max-w-5xl">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-wide text-[#c2183a]">MEDLUM</div>
          <h1 className="mt-1 text-xl font-bold sm:text-2xl">Your video consultation</h1>
          <p className="mt-1 text-sm text-gray-500">Keep this page open until the doctor ends the call.</p>
        </div>

        <div className="mb-3 rounded-2xl border bg-white p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">Waiting room</div>
              <div className="mt-1 text-xs text-gray-500">Status: {session?.status}</div>
            </div>
            <span className="self-start rounded-full bg-gray-100 px-3 py-1 text-xs">
              {active ? "Doctor is in the room" : ended ? "Ended" : "Please wait"}
            </span>
          </div>
        </div>

        {active && session?.meetingUrl ? (
          <>
            <section className="overflow-hidden rounded-2xl border bg-black">
              <div className="telemedicine-video-frame w-full">
                <iframe
                  title="MedLum video consultation"
                  src={session.meetingUrl}
                  allow="camera; microphone; fullscreen; display-capture; autoplay"
                  className="h-full w-full border-0"
                />
              </div>
            </section>
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              <strong>Same room testing?</strong> Put headphones on one device, or mute the speaker on the guest
              phone, or echo will occur (each mic hears the other speaker). For real patients this is not an issue
              when devices are in different locations.
            </div>
            <p className="mt-2 text-center text-[11px] text-gray-500">
              To leave: hang up with the red button in the video, then close this browser tab.
            </p>
          </>
        ) : (
          <section className="rounded-2xl border bg-white p-6 text-center sm:p-8">
            <div className="text-lg font-semibold">
              {ended ? "This consultation has ended." : "You're in the waiting room."}
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {ended
                ? "You can close this page."
                : "The doctor will start the consultation when ready. This page does not expose clinical records."}
            </p>
            {!ended && (
              <p className="mt-3 text-xs text-gray-400">Status updates automatically while this page is open.</p>
            )}
          </section>
        )}

        <p className="mt-3 text-center text-[11px] text-gray-400">
          Video is provided through MedLum's configured video provider. Do not share this consultation link.
        </p>
      </section>
    </main>
  );
}
