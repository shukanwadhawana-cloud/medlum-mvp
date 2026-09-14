"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

function isAppleTouchDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function requestCameraMic() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser cannot access camera/microphone.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  for (const t of stream.getTracks()) t.stop();
}

export default function TelemedicineVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [session, setSession] = useState<any>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [permHint, setPermHint] = useState("");
  const [isIos, setIsIos] = useState(false);

  async function load(sessionId: string) {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/telemedicine/sessions/${encodeURIComponent(sessionId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Unable to load consultation.");
      setSession(j.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load consultation.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setIsIos(isAppleTouchDevice());
    void params.then(({ id: value }) => {
      setId(value);
      void load(value);
    });
  }, [params]);

  async function patch(body: Record<string, unknown>) {
    if (!id) return null;
    const r = await fetch(`/api/telemedicine/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Unable to update consultation.");
    setSession(j.session);
    return j;
  }

  async function enableDevices() {
    setPermHint("");
    setError("");
    try {
      await requestCameraMic();
      setMsg("Microphone and camera unlocked for this site. On iPad, open video in a new tab next so audio is sent.");
    } catch {
      setPermHint(
        "Microphone blocked on this device. Settings → Safari → Microphone → Allow, then tap Allow camera & mic again. On iPad, audio almost always needs Open video in new tab."
      );
    }
  }

  async function openVideoWithMic() {
    setError("");
    setPermHint("");
    try {
      await requestCameraMic();
    } catch {
      setPermHint(
        "Allow Microphone when the browser asks. If nothing happens: Settings → Safari → Microphone → Allow for this website."
      );
    }
    if (session?.meetingUrl) {
      window.open(session.meetingUrl, "_blank", "noopener,noreferrer");
      setMsg("Video opened in a new tab — turn the mic ON in Jitsi (not muted). That is how iPad audio reaches the other phone.");
    }
  }

  async function startCallForGuest() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      try {
        await requestCameraMic();
      } catch {
        /* continue */
      }
      if (session?.status === "Scheduled") await patch({ status: "Waiting" });
      await patch({ status: "Active" });
      setMsg(
        isIos
          ? "Call is live for the guest. On iPad: tap Join with mic (new tab) so your audio is sent — the in-page frame often blocks iPad mic."
          : "Call is live. Guest page will show video when they keep it open."
      );
      if (isIos && session?.meetingUrl) {
        // Soft prompt only; user must open via gesture for reliable permissions.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start call.");
    } finally {
      setBusy(false);
    }
  }

  async function hangUp() {
    setBusy(true);
    setError("");
    try {
      await patch({ status: "Completed" });
      setMsg("Call ended. You can leave this page.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to end call.");
    } finally {
      setBusy(false);
    }
  }

  async function makeInviteLink() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const j = await patch({ regenerateJoinToken: true });
      if (!j?.joinToken) throw new Error("Could not create invite link.");
      const link = `${window.location.origin}/telemedicine/join?token=${encodeURIComponent(j.joinToken)}`;
      setInviteLink(link);
      setMsg("Invite link ready — Copy or Share it.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create invite link.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard blocked — long-press the link and copy.");
    }
  }

  async function shareInvite() {
    if (!inviteLink) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "MedLum video consultation",
          text: "Join the MedLum video call",
          url: inviteLink,
        });
      } else {
        await copyInvite();
      }
    } catch {
      /* cancelled */
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="text-sm text-gray-500">Loading video consultation…</div>
      </AppShell>
    );
  }
  if (error && !session) {
    return (
      <AppShell>
        <div className="rounded-xl bg-white p-4 text-sm text-red-600">{error}</div>
      </AppShell>
    );
  }

  const canJoin = session?.status !== "Completed" && session?.status !== "Cancelled" && session?.status !== "Expired";
  const active = session?.status === "Active";
  const ended = !canJoin;

  return (
    <AppShell>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/telemedicine" className="text-xs text-[#c2183a]">
            ← Telemedicine
          </Link>
          <h1 className="mt-1 text-xl font-bold sm:text-2xl">Video consultation</h1>
          <p className="text-sm text-gray-500">Start the call for the guest, then join with mic on this device.</p>
        </div>
        <span className="self-start rounded-full bg-gray-100 px-3 py-1 text-xs">{session?.status}</span>
      </div>

      {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</div>}
      {permHint && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{permHint}</div>
      )}

      {isIos && canJoin && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <strong>iPad / iPhone host:</strong> Safari often blocks microphone inside the embedded player. Use{" "}
          <strong>Join with mic (new tab)</strong> so your voice reaches the other device. Check the mic icon is not muted
          in Jitsi.
        </div>
      )}

      <section className="mb-3 rounded-2xl border bg-white p-3 sm:p-4">
        <div className="text-sm font-semibold">Consultation room</div>
        <div className="mt-1 break-all text-xs text-gray-500">
          Provider: {session?.provider || "external"} · {session?.sessionKind || "patient"}
          {session?.peerLabel ? ` · ${session.peerLabel}` : ""}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {canJoin && !active && (
            <button
              disabled={busy}
              onClick={() => void startCallForGuest()}
              className="rounded-xl bg-[#c2183a] px-3.5 py-2.5 text-sm font-medium text-white"
            >
              {busy ? "Starting…" : "Start call (let guest in)"}
            </button>
          )}
          {canJoin && session?.meetingUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void openVideoWithMic()}
              className="rounded-xl bg-[#140a1f] px-3.5 py-2.5 text-sm font-medium text-white"
            >
              Join with mic (new tab) — required on iPad
            </button>
          )}
          {canJoin && (
            <button
              disabled={busy}
              type="button"
              onClick={() => void enableDevices()}
              className="rounded-xl border px-3.5 py-2.5 text-sm font-medium"
            >
              Allow camera & mic
            </button>
          )}
          {canJoin && (
            <button
              disabled={busy}
              onClick={() => void hangUp()}
              className="rounded-xl bg-red-600 px-3.5 py-2.5 text-sm font-medium text-white"
            >
              Hang up / end call
            </button>
          )}
          {canJoin && (
            <button
              disabled={busy}
              onClick={() => void makeInviteLink()}
              className="rounded-xl border px-3.5 py-2.5 text-sm font-medium"
            >
              Get / refresh invite link
            </button>
          )}
          {ended && (
            <Link href="/telemedicine" className="rounded-xl border px-3.5 py-2.5 text-sm font-medium">
              Back to Telemedicine
            </Link>
          )}
        </div>

        {inviteLink && (
          <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3">
            <div className="text-xs font-semibold text-green-900">Invite link (tap Copy or Share)</div>
            <input
              readOnly
              value={inviteLink}
              onFocus={(e) => e.target.select()}
              className="mt-2 w-full rounded-lg border bg-white px-2 py-2 text-[11px]"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyInvite()}
                className="rounded-xl bg-[#140a1f] px-4 py-2 text-xs font-medium text-white"
              >
                {copied ? "Copied ✓" : "Copy link"}
              </button>
              <button type="button" onClick={() => void shareInvite()} className="rounded-xl border px-4 py-2 text-xs font-medium">
                Share…
              </button>
            </div>
          </div>
        )}

        {canJoin && (
          <div className="mt-2 space-y-1 text-[11px] text-gray-500">
            <p>
              <strong>iPad audio not heard on iPhone?</strong> On the iPad tap{" "}
              <strong>Join with mic (new tab)</strong>, Allow microphone, and ensure the Jitsi mic icon is unmuted. The
              in-page video box often cannot send iPad audio.
            </p>
            <p>
              <strong>Same room testing?</strong> Headphones on one device to avoid echo.
            </p>
          </div>
        )}
      </section>

      {canJoin && session?.meetingUrl && !isIos ? (
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
      ) : canJoin && session?.meetingUrl && isIos ? (
        <section className="rounded-2xl border bg-white p-6 text-center">
          <div className="text-sm font-semibold">Use the new-tab join for reliable iPad audio</div>
          <p className="mt-2 text-xs text-gray-500">
            Embedded video on iPad often shows you to others without sending your microphone. Tap the black button above.
          </p>
          <button
            type="button"
            onClick={() => void openVideoWithMic()}
            className="mt-4 rounded-xl bg-[#140a1f] px-4 py-3 text-sm font-medium text-white"
          >
            Join with mic (new tab)
          </button>
        </section>
      ) : (
        <section className="rounded-2xl border bg-white p-6 text-center">
          <div className="text-sm font-medium">{ended ? "This consultation has ended." : "Video room unavailable"}</div>
          <p className="mt-1 text-xs text-gray-500">
            {ended
              ? "Use Back to Telemedicine to start another session."
              : "This session is configured for an external video provider or is no longer joinable."}
          </p>
        </section>
      )}
    </AppShell>
  );
}
