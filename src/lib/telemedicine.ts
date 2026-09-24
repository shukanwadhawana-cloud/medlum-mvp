import { createHash, randomBytes } from "node:crypto";

export const TELEMEDICINE_STATUSES = ["Scheduled", "Waiting", "Active", "Completed", "Cancelled", "Expired"] as const;
export type TelemedicineStatus = (typeof TELEMEDICINE_STATUSES)[number];

/** Video transport providers. MedLum remains source of truth for session lifecycle. */
export const VIDEO_PROVIDERS = ["mirotalk", "jitsi", "external"] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

export function createJoinToken() {
  return randomBytes(32).toString("base64url");
}

export function hashJoinToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isTelemedicineStatus(value: unknown): value is TelemedicineStatus {
  return typeof value === "string" && TELEMEDICINE_STATUSES.includes(value as TelemedicineStatus);
}

export function sanitizeMeetingUrl(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Production default: MiroTalk P2P (self-hosted).
 * Override with VIDEO_PROVIDER=jitsi|external and VIDEO_BASE_URL as needed.
 * No secrets committed — base URL from env.
 */
export function getVideoProvider(): VideoProvider {
  const raw = String(process.env.VIDEO_PROVIDER || "mirotalk").toLowerCase().trim();
  if (raw === "jitsi" || raw === "external" || raw === "mirotalk") return raw;
  return "mirotalk";
}

/**
 * High-entropy room URL with no PHI, patient id, doctor id, or appointment id.
 * Invitation/session expiry remains expiresAt on TelemedicineSession — NOT call duration.
 * There is no 5-minute call cutoff.
 */
export function createVideoMeetingUrl(_sessionId?: string): string | null {
  const provider = getVideoProvider();
  if (provider === "external") return null;

  // 24 bytes → base64url ~32 chars; unpredictable, non-enumerable room name
  const roomSecret = randomBytes(24).toString("base64url");

  if (provider === "mirotalk") {
    const base = (process.env.VIDEO_BASE_URL || "https://medlum-mirotalk-p2p.onrender.com").replace(/\/+$/, "");
    // MiroTalk P2P join path: /join/<roomId>
    return `${base}/join/${roomSecret}`;
  }

  // Jitsi fallback (development / alternate provider)
  const base = (process.env.VIDEO_BASE_URL || "https://meet.jit.si").replace(/\/+$/, "");
  const room = `${base}/medlum-${roomSecret}`;
  const hash = [
    "config.prejoinConfig.enabled=false",
    "config.prejoinPageEnabled=false",
    "config.startWithAudioMuted=false",
    "config.startWithVideoMuted=false",
    "config.startSilent=false",
    "config.disableAP=false",
    "config.enableNoAudioDetection=true",
    "config.enableNoisyMicDetection=true",
    "config.disableAudioLevels=false",
    "interfaceConfig.DISABLE_JOIN_LEAVE_NOTIFICATIONS=true",
  ].join("&");
  return `${room}#${hash}`;
}

/** Hostnames allowed for video iframe/CSP (no PHI in URLs). */
export function videoFrameHosts(): string[] {
  const hosts = new Set<string>([
    "https://meet.jit.si",
    "https://*.jit.si",
    "https://medlum-mirotalk-p2p.onrender.com",
  ]);
  try {
    const base = process.env.VIDEO_BASE_URL;
    if (base) {
      const u = new URL(base);
      if (u.protocol === "https:") hosts.add(`${u.protocol}//${u.host}`);
    }
  } catch {
    /* ignore invalid VIDEO_BASE_URL */
  }
  return [...hosts];
}
