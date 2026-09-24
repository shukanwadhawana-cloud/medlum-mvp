/**
 * MedLum Duty — hospital-scoped, geofenced attendance.
 * IST presentation; clinicId is the tenant boundary.
 * Patterns adapted from Sannidhi (geofence, regularization, admin desk) for continuous hospital duty.
 */

export type DutyPunchType = "IN" | "OUT";
export type DutyPunchSource = "SELF" | "ADMIN";
export type DutyRequestType = "REGULARIZE" | "LEAVE";
export type DutyRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

const ADMIN_ROLES = new Set(["Owner", "Admin", "Manager"]);

export function isDutyAdminRole(role: string) {
  return ADMIN_ROLES.has(role);
}

/** Haversine distance in meters (WGS84). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type GeofenceConfig = {
  enabled: boolean;
  lat: number | null;
  lng: number | null;
  radiusMeters: number;
};

export function evaluateGeofence(
  cfg: GeofenceConfig,
  lat: number | null | undefined,
  lng: number | null | undefined
): { ok: boolean; within: boolean; distanceMeters: number | null; error?: string } {
  if (!cfg.enabled) {
    return { ok: true, within: true, distanceMeters: null };
  }
  if (cfg.lat == null || cfg.lng == null) {
    return { ok: false, within: false, distanceMeters: null, error: "Hospital geofence is enabled but not configured." };
  }
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { ok: false, within: false, distanceMeters: null, error: "Location is required for geofenced punch-in/out." };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, within: false, distanceMeters: null, error: "Invalid GPS coordinates." };
  }
  const d = distanceMeters(cfg.lat, cfg.lng, lat, lng);
  const radius = Math.max(50, Math.min(5000, cfg.radiusMeters || 200));
  if (d > radius) {
    return {
      ok: false,
      within: false,
      distanceMeters: Math.round(d),
      error: `You are ~${Math.round(d)} m from the hospital. Punch only within ${radius} m of campus.`,
    };
  }
  return { ok: true, within: true, distanceMeters: Math.round(d) };
}

export function formatIst(iso: Date | string) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

export function formatIstTime(iso: Date | string) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
}

/** IST calendar day start as UTC Date (for punchedAt range queries). */
export function istDayStartUtc(ref: Date = new Date()): Date {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(ref.getTime() + istOffsetMs);
  return new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs);
}

export function istDayEndUtc(ref: Date = new Date()): Date {
  return new Date(istDayStartUtc(ref).getTime() + 24 * 60 * 60 * 1000);
}

/** YYYY-MM-DD in Asia/Kolkata for dayDate storage. */
export function istDateKey(ref: Date = new Date()): string {
  return ref.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
