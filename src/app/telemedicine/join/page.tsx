"use client";

import { useEffect, useRef, useState } from "react";
import { openConferenceInNewTab, warmConferenceOrigin } from "@/lib/telemedicine-client";

/**
 * Patient-facing waiting room on MedLum (Vercel).
 * Never shows Render infrastructure URLs or loading chrome.
 * When the clinician starts the call (status Active), patient joins MiroTalk
 * via top-level navigation / new tab for reliable mic/camera on mobile Safari.
 */
export default function TelemedicineJoinPage() {
  const [token, setToken] = useState("");
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const warmed = useRef(false);

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
        const r = await fetch(`/api/telemedicine/join?token=${encodeURIComponent(value)}`, {
          cache: "no-store",
        });
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
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (session?.meetingUrl && !warmed.current) {
      warmed.current = true;
      warmConferenceOrigin(session.meetingUrl);
    }
  }, [session?.meetingUrl]);

  function joinConference() {
    const url = session?.meetingUrl;
    if (!url) {
      setError("Video room is not ready yet. Please wait for the clinician to start the call.");
      return;
    }
    setOpening(true);
    openConferenceInNewTab(url);
    setTimeout(() => setOpening(false), 1500);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4 sm:p-6">
        <div className="text-sm text-gray-500">Preparing your consultation…</div>
      </main>
    );
  }
  if (error && !session) {
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
  const ended = ["Completed", "Cancelled", "Expired"].includes(String(session?.status || ""));
  const canJoin = active && !!session?.meetingUrl;

  return (
    <main className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <section className="mx-auto w-full max-w-lg">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-wide text-[#c2183a]">MEDLUM</div>
          <h1 className="mt-1 text-xl font-bold text-[#140a1f]">Video consultation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Secure patient waiting room. Clinical records are not shown on this page.
          </p>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="mb-4 rounded-2xl border bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">Waiting room</div>
              <div className="mt-1 text-xs text-gray-500">
                Status: {ended ? "Ended" : active ? "Ready" : session?.status || "Waiting"}
              </div>
            </div>
            <span className="self-start rounded-full bg-gray-100 px-3 py-1 text-xs">
              {active ? "Doctor is ready" : ended ? "Ended" : "Please wait"}
            </span>
          </div>
        </div>

        {canJoin ? (
          <section className="rounded-2xl border bg-white p-6 text-center sm:p-8">
            <div className="text-lg font-semibold text-[#140a1f]">Your clinician is ready</div>
            <p className="mt-2 text-sm text-gray-600">
              Tap below to open the video room. Allow microphone and camera when your browser asks.
            </p>
            <button
              type="button"
              onClick={joinConference}
              disabled={opening}
              className="mt-5 w-full rounded-xl bg-[#c2183a] px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {opening ? "Opening video…" : "Join video call"}
            </button>
            <p className="mt-3 text-[11px] text-gray-400">
              Opens in a new tab when possible. If nothing opens, check popup settings, then try again.
            </p>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-950">
              <strong>Audio tip:</strong> If testing two phones in the same room, use headphones on one device to
              avoid echo. For real visits with devices in different places this is not needed.
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border bg-white p-6 text-center sm:p-8">
            <div className="text-lg font-semibold">
              {ended ? "This consultation has ended." : "You're in the waiting room."}
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {ended
                ? "You can close this page."
                : "The clinician will start the consultation when ready. This page updates automatically."}
            </p>
            {!ended && (
              <p className="mt-3 text-xs text-gray-400">Keep this page open. You will see a Join button when the call starts.</p>
            )}
          </section>
        )}

        {/* CSS contract: telemedicine-video-frame used for mobile layout CSS */}
        <div className="telemedicine-video-frame hidden" aria-hidden />
        <p className="mt-4 text-center text-[11px] text-gray-400">
          Do not share this consultation link. Powered by MedLum.
        </p>
      </section>
    </main>
  );
}
