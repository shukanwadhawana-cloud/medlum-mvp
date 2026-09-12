import { createHash, randomBytes } from "node:crypto";

export const TELEMEDICINE_STATUSES = ["Scheduled", "Waiting", "Active", "Completed", "Cancelled", "Expired"] as const;
export type TelemedicineStatus = (typeof TELEMEDICINE_STATUSES)[number];

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
