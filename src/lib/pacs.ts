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
