import type { StorageProvider } from "./types";
import { createLocalStorageProvider } from "./local";

/** Application hard ceiling (bytes). Default 8 GiB — below typical 10 GB free-tier R2. */
export function storageQuotaBytes(): number {
  const raw = process.env.STORAGE_QUOTA_BYTES;
  if (raw && /^\d+$/.test(raw)) return parseInt(raw, 10);
  return 8 * 1024 * 1024 * 1024;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/jpg"]);

export function getStorageProvider(): StorageProvider {
  const provider = (process.env.STORAGE_PROVIDER || "local").toLowerCase();
  if (provider === "r2") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createR2StorageProvider } = require("./r2");
    return createR2StorageProvider();
  }
  return createLocalStorageProvider();
}

export function buildStorageKey(clinicId: string, patientId: string, labOrderId: string | null, documentId: string, ext: string) {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const orderPart = labOrderId || "no-order";
  return `clinics/${clinicId}/patients/${patientId}/labs/${orderPart}/${documentId}.${safeExt}`;
}
