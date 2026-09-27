/**
 * Browser-side helpers for opening MiroTalk (and compatible) conference URLs.
 * Critical: window.open must run synchronously on the user gesture for Safari/iOS.
 */

/** Open conference in a new tab; prepare blank tab first so await does not lose the gesture. */
export function openConferenceInNewTab(meetingUrl: string): Window | null {
  if (!meetingUrl || typeof window === "undefined") return null;
  // Synchronous popup under the user gesture — required on iPhone/iPad Safari.
  const win = window.open("about:blank", "_blank");
  if (win && !win.closed) {
    try {
      win.opener = null;
    } catch {
      /* ignore */
    }
    win.location.href = meetingUrl;
    return win;
  }
  // Popup blocked: same-tab navigation so the call still opens.
  window.location.href = meetingUrl;
  return null;
}

/** Fire-and-forget warm-up of the MiroTalk origin (e.g. Render cold start) without blocking UI. */
export function warmConferenceOrigin(meetingUrl: string | null | undefined) {
  if (!meetingUrl || typeof window === "undefined") return;
  try {
    const origin = new URL(meetingUrl).origin;
    if (!origin.startsWith("https://")) return;
    void fetch(`${origin}/`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
  } catch {
    /* ignore invalid URL */
  }
}
