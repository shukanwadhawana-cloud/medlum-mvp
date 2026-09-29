import { createHash, randomBytes } from "node:crypto";

export const TELEMEDICINE_STATUSES = ["Scheduled", "Waiting", "Active", "Completed", "Cancelled", "Expired"] as const;
export type TelemedicineStatus = (typeof TELEMEDICINE_STATUSES)[number];

/** Video transport. MiroTalk is the only production engine — Jitsi is disabled. */
export const VIDEO_PROVIDERS = ["mirotalk", "external"] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

const MIROTALK_DEFAULT = "https://medlum-mirotalk-p2p.onrender.com";

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

/** True if URL is Jitsi / meet.jit.si (must not be used). */
export function isJitsiMeetingUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "meet.jit.si" || host.endsWith(".jit.si") || host.includes("jitsi");
  } catch {
    return /jit\.si|jitsi/i.test(url);
  }
}

/**
 * Production video is MiroTalk P2P only.
 * VIDEO_PROVIDER=jitsi is ignored (legacy env mistake).
 * VIDEO_BASE_URL may override origin only if it is not a Jitsi host.
 */
export function getVideoProvider(): VideoProvider {
  const raw = String(process.env.VIDEO_PROVIDER || "mirotalk").toLowerCase().trim();
  if (raw === "external") return "external";
  // jitsi and anything else → mirotalk
  return "mirotalk";
}

function mirotalkBase(): string {
  const fromEnv = String(process.env.VIDEO_BASE_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) {
    try {
      const host = new URL(fromEnv).hostname.toLowerCase();
      // Never allow a Jitsi base even if env is mis-set
      if (host === "meet.jit.si" || host.endsWith(".jit.si") || host.includes("jitsi")) {
        return MIROTALK_DEFAULT;
      }
      if (fromEnv.startsWith("https://")) return fromEnv;
    } catch {
      /* fall through */
    }
  }
  return MIROTALK_DEFAULT;
}

/**
 * Always creates a MiroTalk room URL (unless external provider).
 * No PHI in room id. No Jitsi.
 */
export function createVideoMeetingUrl(_sessionId?: string): string | null {
  if (getVideoProvider() === "external") return null;
  const roomSecret = randomBytes(24).toString("base64url");
  const base = mirotalkBase();
  return `${base}/join/${roomSecret}`;
}

/** Hostnames allowed for video iframe/CSP. */
export function videoFrameHosts(): string[] {
  const hosts = new Set<string>([MIROTALK_DEFAULT, "https://meet.jit.si", "https://*.jit.si"]);
  try {
    const base = mirotalkBase();
    const u = new URL(base);
    if (u.protocol === "https:") hosts.add(`${u.protocol}//${u.host}`);
  } catch {
    /* ignore */
  }
  return [...hosts];
}
