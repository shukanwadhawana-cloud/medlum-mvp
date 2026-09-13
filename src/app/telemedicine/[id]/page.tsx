"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

export default function TelemedicineVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [session, setSession] = useState<any>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

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

  async function update(status: "Waiting" | "Active" | "Completed" | "Cancelled") {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await patch({ status });
      if (status === "Active") setMsg("Guest can now enter the video room.");
      if (status === "Completed" || status === "Cancelled") {
        setMsg("Call ended. Guest will see the consultation as closed.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update consultation.");
    } finally {
      setBusy(false);
    }
  }

  async function startCallForGuest() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      if (session?.status === "Scheduled") await patch({ status: "Waiting" });
      await patch({ status: "Active" });
      setMsg("Call is live. Guest page will show video when they keep it open.");
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
      /* user cancelled share */
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
          <p className="text-sm text-gray-500">Start the call for the guest, then join video below.</p>
        </div>
        <span className="self-start rounded-full bg-gray-100 px-3 py-1 text-xs">{session?.status}</span>
      </div>

      {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</div>}

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
          {canJoin && session?.meetingUrl && (
            <a
              href={session.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border px-3.5 py-2.5 text-sm font-medium"
            >
              Open video in new tab
            </a>
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
          <p className="mt-2 text-[11px] text-gray-500">
            <strong>Same room (iPhone + iPad)?</strong> Use headphones on one device, or mute the speaker on the
            guest phone — otherwise each microphone hears the other speaker and you get echo. Real patients in another
            location will not have this problem.
          </p>
        )}
      </section>

      {canJoin && session?.meetingUrl ? (
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
