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
  if (!Number.isFinite(cfg.lat) || !Number.isFinite(cfg.lng) ||
      cfg.lat < -90 || cfg.lat > 90 || cfg.lng < -180 || cfg.lng > 180) {
    return { ok: false, within: false, distanceMeters: null, error: "Saved hospital coordinates are invalid. Ask the hospital admin to correct the geofence." };
  }
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
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

/**
 * Validate the browser-reported GPS accuracy before using a location for
 * geofence decisions. Browser GPS remains client-provided and is not
 * hardware-attested; this prevents missing, invalid, or too-imprecise fixes
 * from being treated as reliable locations.
 */
export const MAX_DUTY_GPS_ACCURACY_METERS = 100;

export function validateGpsAccuracy(
  accuracyMeters: number | null | undefined,
): { ok: boolean; error?: string } {
  if (
    accuracyMeters == null ||
    !Number.isFinite(accuracyMeters) ||
    accuracyMeters <= 0
  ) {
    return {
      ok: false,
      error: "A valid GPS accuracy reading is required. Enable precise Location Services and try again.",
    };
  }
  if (accuracyMeters > MAX_DUTY_GPS_ACCURACY_METERS) {
    return {
      ok: false,
      error: `GPS accuracy is currently about ${Math.round(accuracyMeters)} m. MedLum requires a fix within ${MAX_DUTY_GPS_ACCURACY_METERS} m; move to an open area and retry.`,
    };
  }
  return { ok: true };
}

/**
 * Conservative check for an attendance punch or address-based activation.
 * The full reported uncertainty must fit inside the geofence radius, not just
 * the reported point. This is a quality check, not GPS anti-spoof attestation.
 */
export function evaluateGeofenceFix(
  cfg: GeofenceConfig,
  lat: number | null | undefined,
  lng: number | null | undefined,
  accuracyMeters: number | null | undefined,
): { ok: boolean; within: boolean; distanceMeters: number | null; error?: string } {
  const base = evaluateGeofence(cfg, lat, lng);
  if (!base.ok || !cfg.enabled) return base;

  const accuracy = validateGpsAccuracy(accuracyMeters);
  if (!accuracy.ok) {
    return { ok: false, within: false, distanceMeters: base.distanceMeters, error: accuracy.error };
  }

  const exactDistance = distanceMeters(cfg.lat as number, cfg.lng as number, lat as number, lng as number);
  const radius = Math.max(50, Math.min(5000, cfg.radiusMeters || 200));
  if (exactDistance + (accuracyMeters as number) > radius) {
    return {
      ok: false,
      within: false,
      distanceMeters: Math.round(exactDistance),
      error: `Your GPS uncertainty is too large to confirm you are inside this hospital's ${radius} m boundary. Move closer to the saved centre or improve GPS accuracy.`,
    };
  }
  return { ...base, within: true };
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
