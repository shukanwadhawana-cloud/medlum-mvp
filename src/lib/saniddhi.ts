/**
 * Optional Saniddhi outbound adapter for MedLum Duty.
 * Credentials via env only — never commit secrets.
 *
 * SANIDDHI_BASE_URL=
 * SANIDDHI_API_KEY=
 * SANIDDHI_ORG_ID=   (optional)
 *
 * When unset, Duty works fully natively; sync is skipped (not an error).
 */

export type SaniddhiPunchPayload = {
  clinicId: string;
  clinicName: string;
  staffCode: string;
  staffName: string;
  type: "IN" | "OUT";
  punchedAt: string;
  lat?: number | null;
  lng?: number | null;
  source: string;
  medlumEventId: string;
};

export type SaniddhiSyncResult =
  | { synced: false; reason: "not_configured" | "disabled" }
  | { synced: true; ref: string }
  | { synced: false; reason: "error"; error: string };

export function isSaniddhiConfigured(): boolean {
  return Boolean(process.env.SANIDDHI_BASE_URL?.trim() && process.env.SANIDDHI_API_KEY?.trim());
}

/**
 * Push a MedLum Duty event to Saniddhi when configured.
 * Failures do not roll back MedLum attendance (MedLum is source of truth).
 */
export async function pushPunchToSaniddhi(payload: SaniddhiPunchPayload): Promise<SaniddhiSyncResult> {
  const base = process.env.SANIDDHI_BASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SANIDDHI_API_KEY?.trim();
  if (!base || !key) return { synced: false, reason: "not_configured" };

  try {
    const url = `${base}/api/v1/attendance/punch`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "x-org-id": process.env.SANIDDHI_ORG_ID?.trim() || "",
      },
      body: JSON.stringify({
        externalId: payload.medlumEventId,
        employeeCode: payload.staffCode,
        employeeName: payload.staffName,
        facilityId: payload.clinicId,
        facilityName: payload.clinicName,
        punchType: payload.type,
        punchedAt: payload.punchedAt,
        latitude: payload.lat ?? undefined,
        longitude: payload.lng ?? undefined,
        source: payload.source,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { synced: false, reason: "error", error: `Saniddhi HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const body = await res.json().catch(() => ({}));
    const ref = String(body.id || body.ref || body.transactionId || "ok");
    return { synced: true, ref };
  } catch (e) {
    return { synced: false, reason: "error", error: e instanceof Error ? e.message : "Saniddhi sync failed" };
  }
}
