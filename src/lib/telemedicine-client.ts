/**
 * Browser-side helpers for opening MiroTalk conference URLs only.
 * Jitsi / meet.jit.si URLs are never opened — they are rewritten to MiroTalk.
 * Critical: window.open must run synchronously on the user gesture for Safari/iOS.
 */

const MIROTALK_ORIGIN = "https://medlum-mirotalk-p2p.onrender.com";

function isJitsiUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "meet.jit.si" || host.endsWith(".jit.si") || host.includes("jitsi");
  } catch {
    return /jit\.si|jitsi/i.test(url);
  }
}

/** Ensure a conference URL is MiroTalk. If Jitsi, build a fresh MiroTalk room id. */
export function ensureMirotalkUrl(meetingUrl: string): string {
  if (!meetingUrl) return `${MIROTALK_ORIGIN}/join/${Math.random().toString(36).slice(2)}`;
  if (!isJitsiUrl(meetingUrl)) {
    try {
      if (meetingUrl.startsWith("https://")) return meetingUrl;
    } catch {
      /* fall through */
    }
  }
  let room = "";
  try {
    const path = new URL(meetingUrl).pathname;
    const parts = path.split("/").filter(Boolean);
    room = parts[parts.length - 1] || "";
    room = room.replace(/^medlum-/, "");
  } catch {
    room = "";
  }
  if (!room || room.length < 8) {
    room = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  }
  return `${MIROTALK_ORIGIN}/join/${encodeURIComponent(room)}`;
}

/** Open conference in a new tab; prepare blank tab first so await does not lose the gesture. */
export function openConferenceInNewTab(meetingUrl: string): Window | null {
  if (!meetingUrl || typeof window === "undefined") return null;
  const safeUrl = ensureMirotalkUrl(meetingUrl);
  const win = window.open("about:blank", "_blank");
  if (win && !win.closed) {
    try {
      win.opener = null;
    } catch {
      /* ignore */
    }
    win.location.href = safeUrl;
    return win;
  }
  window.location.href = safeUrl;
  return null;
}

/** Fire-and-forget warm-up of the MiroTalk origin (e.g. Render cold start) without blocking UI. */
export function warmConferenceOrigin(meetingUrl: string | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    const origin = meetingUrl && !isJitsiUrl(meetingUrl)
      ? new URL(meetingUrl).origin
      : MIROTALK_ORIGIN;
    if (!origin.startsWith("https://")) return;
    void fetch(`${origin}/`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
  } catch {
    /* ignore invalid URL */
  }
}
