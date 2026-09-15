import { createHash, randomBytes } from "node:crypto";

export const TELEMEDICINE_STATUSES = ["Scheduled", "Waiting", "Active", "Completed", "Cancelled", "Expired"] as const;
export type TelemedicineStatus = (typeof TELEMEDICINE_STATUSES)[number];

export const VIDEO_PROVIDERS = ["jitsi", "external"] as const;
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

export function getVideoProvider(): VideoProvider {
  return process.env.VIDEO_PROVIDER === "external" ? "external" : "jitsi";
}

/** Jitsi URL tuned for mobile: skip prejoin, prefer live mic/camera. */
export function createVideoMeetingUrl(sessionId: string) {
  const provider = getVideoProvider();
  if (provider === "external") return null;

  const base = (process.env.VIDEO_BASE_URL || "https://meet.jit.si").replace(/\/+$/, "");
  const roomSecret = randomBytes(18).toString("base64url");
  const room = `${base}/medlum-${sessionId}-${roomSecret}`;
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
