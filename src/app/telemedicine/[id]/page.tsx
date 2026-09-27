"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { openConferenceInNewTab, warmConferenceOrigin } from "@/lib/telemedicine-client";

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
  const [participants, setParticipants] = useState<any[]>([]);
  const [participantName, setParticipantName] = useState("");
  const [participantRole, setParticipantRole] = useState("Consultant");
  const [participantInviteLink, setParticipantInviteLink] = useState("");
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
      void loadParticipants(sessionId);
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

  useEffect(() => {
    if (session?.meetingUrl) warmConferenceOrigin(session.meetingUrl);
  }, [session?.meetingUrl]);

  async function loadParticipants(sessionId: string) {
    try {
      const r = await fetch(`/api/telemedicine/sessions/${encodeURIComponent(sessionId)}/participants`, { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setParticipants(j.participants || []);
    } catch { /* participant list is supplementary */ }
  }

  async function inviteParticipant() {
    if (!id || !participantName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/telemedicine/sessions/${encodeURIComponent(id)}/participants`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: participantName.trim(), role: participantRole }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Unable to invite participant.");
      setParticipants((current) => [...current, j.participant]);
      setParticipantName("");
      setParticipantInviteLink(`${window.location.origin}/telemedicine/join?token=${encodeURIComponent(j.joinToken)}`);
      setMsg("Participant invitation created. Share the link below.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to invite participant.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeParticipant(participantId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/telemedicine/sessions/${encodeURIComponent(id)}/participants?participantId=${encodeURIComponent(participantId)}`, { method: "DELETE", credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Unable to revoke participant.");
      setParticipants((current) => current.map((p) => p.id === participantId ? j.participant : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to revoke participant.");
    } finally {
      setBusy(false);
    }
  }

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
      setMsg("Microphone and camera unlocked for this site. Open video in a new tab next so audio is sent.");
    } catch {
      setPermHint(
        "Microphone blocked on this device. Settings → Safari → Microphone → Allow, then tap Allow camera & mic again."
      );
    }
  }

  function openVideoWithMic() {
    setError("");
    setPermHint("");
    const url = session?.meetingUrl;
    if (!url) {
      setError("Video room is not ready yet. Start the call for the guest first, then try again.");
      return;
    }
    openConferenceInNewTab(url);
    void requestCameraMic()
      .then(() => setMsg("Video opened in a new tab. Allow microphone/camera if asked, then join the MiroTalk room."))
      .catch(() =>
        setPermHint(
          "Allow Microphone when the browser asks. Settings > Safari > Microphone > Allow for this website. Then use the mic control inside the video room."
        )
      );
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
        "Call is live for the guest. Tap Join video (new tab) so your microphone is sent — required on iPhone/iPad and recommended on desktop."
      );
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

      <section className="mb-3 rounded-2xl border bg-white p-3 sm:p-4">
        <div className="text-sm font-semibold">Consultation room</div>
        <div className="mt-1 break-all text-xs text-gray-500">
          Provider: {session?.provider || "mirotalk"} · {session?.sessionKind || "patient"}
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
              onClick={() => openVideoWithMic()}
              className="rounded-xl bg-[#140a1f] px-3.5 py-2.5 text-sm font-medium text-white"
            >
              Join video (new tab) — required on iPad
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

        <section className="mt-4 rounded-2xl border bg-white p-4">
          <div className="text-sm font-semibold">Invite additional people</div>
          <p className="mt-1 text-xs text-gray-500">Zoom-style group call: invite another consultant, RMO, nurse, specialist, pharmacist, or observer. Everyone uses this same consultation room.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
            <input value={participantName} onChange={(e) => setParticipantName(e.target.value)} placeholder="Person name" className="rounded-xl border px-3 py-2.5 text-sm" />
            <select value={participantRole} onChange={(e) => setParticipantRole(e.target.value)} className="rounded-xl border px-3 py-2.5 text-sm">
              <option>Consultant</option><option>Specialist</option><option>RMO</option><option>Nurse</option><option>Pharmacist</option><option>Observer</option><option>Guest</option>
            </select>
            <button type="button" disabled={busy || !participantName.trim()} onClick={() => void inviteParticipant()} className="rounded-xl bg-[#c2183a] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Invite</button>
          </div>
          {participantInviteLink && (
            <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3">
              <div className="text-xs font-semibold text-green-900">New participant link</div>
              <input readOnly value={participantInviteLink} onFocus={(e) => e.target.select()} className="mt-2 w-full rounded-lg border bg-white px-2 py-2 text-[11px]" />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void navigator.clipboard?.writeText(participantInviteLink)} className="rounded-xl bg-[#140a1f] px-4 py-2 text-xs font-medium text-white">Copy link</button>
                {typeof navigator !== "undefined" && navigator.share && <button type="button" onClick={() => void navigator.share({ title: "MedLum consultation", text: "Join the MedLum consultation", url: participantInviteLink })} className="rounded-xl border px-4 py-2 text-xs font-medium">Share…</button>}
              </div>
            </div>
          )}
          {participants.length > 0 && (
            <div className="mt-4 space-y-2">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs">
                  <div><span className="font-medium">{p.name}</span><span className="ml-2 text-gray-500">{p.role} · {p.status}</span></div>
                  {p.status !== "REVOKED" && <button type="button" disabled={busy} onClick={() => void revokeParticipant(p.id)} className="text-red-600">Revoke</button>}
                </div>
              ))}
            </div>
          )}
        </section>

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
              <strong>iPad audio:</strong> Tap <strong>Join video (new tab)</strong>, allow microphone, and unmute
              in the MiroTalk room if needed.
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
          <p className="bg-white px-3 py-2 text-center text-[11px] text-gray-500">
            Prefer <strong>Join video (new tab)</strong> if the embedded view cannot send your microphone.
          </p>
        </section>
      ) : canJoin && session?.meetingUrl && isIos ? (
        <section className="rounded-2xl border bg-white p-6 text-center">
          <div className="text-sm font-semibold">Use the new-tab join for reliable iPad audio</div>
          <p className="mt-2 text-xs text-gray-500">
            Embedded video on iPad often shows you to others without sending your microphone.
          </p>
          <button
            type="button"
            onClick={() => openVideoWithMic()}
            className="mt-4 rounded-xl bg-[#140a1f] px-4 py-3 text-sm font-medium text-white"
          >
            Join video (new tab)
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
