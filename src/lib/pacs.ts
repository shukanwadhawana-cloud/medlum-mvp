/**
 * PACS / DICOMweb configuration helpers for MedLum.
 * Orthanc runs as an independent service. Vercel never stores DICOM objects.
 */

export type PacsConfig = {
  enabled: boolean;
  orthancBaseUrl: string;
  orthancPublicUrl: string;
  dicomwebRoot: string;
  ohifBaseUrl: string;
  hasServerCredentials: boolean;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Read optional PACS env. Fail closed when disabled or misconfigured. */
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

  if (!enabled) {
    return {
      enabled: false,
      orthancBaseUrl: "",
      orthancPublicUrl: "",
      dicomwebRoot,
      ohifBaseUrl: "",
      hasServerCredentials: false,
    };
  }

  if (!orthancBaseUrl || !isSafeHttpUrl(orthancBaseUrl)) {
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

/**
 * Build OHIF viewer URL for a Study Instance UID.
 * Uses only configured base URLs (no client-supplied hosts → SSRF safe).
 */
export function buildOhifViewerUrl(studyInstanceUid: string, config: PacsConfig): string | null {
  const uid = String(studyInstanceUid || "").trim();
  if (!uid || !config.enabled || !config.ohifBaseUrl) return null;
  // Basic DICOM UID character check
  if (!/^[0-9.]+$/.test(uid) || uid.length > 128) return null;

  const dicomweb = `${config.orthancPublicUrl}${config.dicomwebRoot}`;
  const url = new URL("/viewer", config.ohifBaseUrl.endsWith("/") ? config.ohifBaseUrl : `${config.ohifBaseUrl}/`);
  // OHIF 3 common query param
  url.searchParams.set("StudyInstanceUIDs", uid);
  // Optional datasources via config in self-hosted OHIF; public demo may ignore orthanc url.
  url.searchParams.set("datasources", "dicomweb");
  url.searchParams.set("dicomwebRoot", dicomweb);
  return url.toString();
}

export function orthancServerAuthHeader(): HeadersInit | undefined {
  const user = process.env.PACS_ORTHANC_USERNAME;
  const pass = process.env.PACS_ORTHANC_PASSWORD;
  if (!user || !pass) return undefined;
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}
