export type PacsConfig = {
  enabled: boolean;
  orthancBaseUrl: string;
  orthancPublicUrl: string;
  dicomwebRoot: string;
  ohifBaseUrl: string;
  hasServerCredentials: boolean;
};

export type OrthancStudyMatch = {
  orthancId: string;
  studyInstanceUid: string;
  patientId?: string;
  patientName?: string;
  modalities?: string[];
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const httpAllowed = process.env.NODE_ENV !== "production" && u.protocol === "http:";
    return u.protocol === "https:" || httpAllowed;
  } catch {
    return false;
  }
}

export function getPacsConfig(): PacsConfig {
  const enabled = String(process.env.PACS_ENABLED || "").toLowerCase() === "true";
  const orthancBaseUrl = stripTrailingSlash(String(process.env.PACS_ORTHANC_BASE_URL || "").trim());
  const orthancPublicUrl = stripTrailingSlash(
    String(process.env.PACS_ORTHANC_PUBLIC_URL || orthancBaseUrl).trim()
  );
  const dicomwebRoot = String(process.env.PACS_DICOMWEB_ROOT || "/dicom-web").trim() || "/dicom-web";
  const ohifBaseUrl = stripTrailingSlash(String(process.env.PACS_OHIF_BASE_URL || "").trim());
  const hasServerCredentials = Boolean(
    process.env.PACS_ORTHANC_USERNAME && process.env.PACS_ORTHANC_PASSWORD
  );

  if (!enabled || !orthancBaseUrl || !isSafeHttpUrl(orthancBaseUrl)) {
    return {
      enabled: false,
      orthancBaseUrl: "",
      orthancPublicUrl: "",
      dicomwebRoot,
      ohifBaseUrl: "",
      hasServerCredentials: false,
    };
  }

  return {
    enabled: true,
    orthancBaseUrl,
    orthancPublicUrl: orthancPublicUrl && isSafeHttpUrl(orthancPublicUrl) ? orthancPublicUrl : orthancBaseUrl,
    dicomwebRoot: dicomwebRoot.startsWith("/") ? dicomwebRoot : `/${dicomwebRoot}`,
    ohifBaseUrl: ohifBaseUrl && isSafeHttpUrl(ohifBaseUrl) ? ohifBaseUrl : "",
    hasServerCredentials,
  };
}

export function buildOhifViewerUrl(studyInstanceUid: string, config: PacsConfig): string | null {
  const uid = String(studyInstanceUid || "").trim();
  if (!uid || !config.enabled || !config.ohifBaseUrl) return null;
  if (uid.length > 64 || !/^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*$/.test(uid)) return null;
  // OHIF's DICOMweb datasource must be configured in its deployment config.
  // These query parameters do not configure a datasource; never put PACS credentials in the URL.
  const base = config.ohifBaseUrl.endsWith("/") ? config.ohifBaseUrl : `${config.ohifBaseUrl}/`;
  const url = new URL("viewer", base);
  url.searchParams.set("StudyInstanceUIDs", uid);
  return url.toString();
}

function orthancAuthHeader(): string | undefined {
  const user = process.env.PACS_ORTHANC_USERNAME;
  const pass = process.env.PACS_ORTHANC_PASSWORD;
  if (!user || !pass) return undefined;
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

/**
 * Server-to-server lookup of a study in Orthanc by StudyInstanceUID.
 * Never call this from the browser; credentials stay on the server.
 */
export async function findOrthancStudyByUid(
  studyInstanceUid: string,
  config: PacsConfig,
  options?: { timeoutMs?: number }
): Promise<{ ok: true; match: OrthancStudyMatch } | { ok: false; code: string; message: string }> {
  const uid = String(studyInstanceUid || "").trim();
  if (!uid || uid.length > 64 || !/^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*$/.test(uid)) {
    return { ok: false, code: "INVALID_UID", message: "Invalid Study Instance UID" };
  }
  if (!config.enabled || !config.orthancBaseUrl) {
    return { ok: false, code: "PACS_UNAVAILABLE", message: "PACS is not configured" };
  }

  const timeoutMs = options?.timeoutMs ?? 12_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const auth = orthancAuthHeader();
  if (auth) headers.Authorization = auth;

  try {
    const findRes = await fetch(`${config.orthancBaseUrl}/tools/find`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        Level: "Study",
        Query: { StudyInstanceUID: uid },
        Expand: false,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (findRes.status === 401 || findRes.status === 403) {
      return { ok: false, code: "PACS_AUTH_FAILED", message: "Orthanc authentication failed" };
    }
    if (!findRes.ok) {
      return {
        ok: false,
        code: "PACS_LOOKUP_FAILED",
        message: `Orthanc find failed (${findRes.status})`,
      };
    }
    const ids = (await findRes.json()) as unknown;
    if (!Array.isArray(ids) || ids.length === 0) {
      return { ok: false, code: "STUDY_NOT_IN_PACS", message: "Study not found in Orthanc" };
    }
    const orthancId = String(ids[0] || "").trim();
    if (!orthancId) {
      return { ok: false, code: "STUDY_NOT_IN_PACS", message: "Study not found in Orthanc" };
    }

    const studyRes = await fetch(`${config.orthancBaseUrl}/studies/${encodeURIComponent(orthancId)}`, {
      method: "GET",
      headers: auth ? { Authorization: auth, Accept: "application/json" } : { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!studyRes.ok) {
      return {
        ok: false,
        code: "PACS_LOOKUP_FAILED",
        message: `Orthanc study metadata failed (${studyRes.status})`,
      };
    }
    const study = (await studyRes.json()) as {
      ID?: string;
      MainDicomTags?: {
        StudyInstanceUID?: string;
        ModalitiesInStudy?: string;
      };
      PatientMainDicomTags?: {
        PatientID?: string;
        PatientName?: string;
      };
    };
    const returnedUid = String(study.MainDicomTags?.StudyInstanceUID || "").trim();
    if (!returnedUid || returnedUid !== uid) {
      return {
        ok: false,
        code: "UID_MISMATCH",
        message: "Orthanc StudyInstanceUID does not match MedLum record",
      };
    }
    const modalitiesRaw = String(study.MainDicomTags?.ModalitiesInStudy || "").trim();
    return {
      ok: true,
      match: {
        orthancId: String(study.ID || orthancId),
        studyInstanceUid: returnedUid,
        patientId: study.PatientMainDicomTags?.PatientID,
        patientName: study.PatientMainDicomTags?.PatientName,
        modalities: modalitiesRaw ? modalitiesRaw.split("\\").filter(Boolean) : undefined,
      },
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "PACS_TIMEOUT" : "PACS_UNREACHABLE",
      message: aborted ? "Orthanc request timed out" : "Orthanc is unreachable",
    };
  } finally {
    clearTimeout(timer);
  }
}
