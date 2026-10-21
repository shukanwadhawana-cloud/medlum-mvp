import type { StorageProvider } from "./types";
import { createLocalStorageProvider } from "./local";

/** Application storage quota, aligned with the durable provider in use. */
export function storageQuotaBytes(): number {
  const raw = process.env.STORAGE_QUOTA_BYTES;
  if (raw && /^\\d+$/.test(raw)) return parseInt(raw, 10);
  const provider = (process.env.STORAGE_PROVIDER || "local").toLowerCase();
  if (provider === "database" || (provider !== "r2" && isServerlessRuntime())) {
    const databaseQuota = process.env.DATABASE_STORAGE_QUOTA_BYTES || "";
    if (databaseQuota && /^\\d+$/.test(databaseQuota)) return parseInt(databaseQuota, 10);
    return 256 * 1024 * 1024;
  }
  return 8 * 1024 * 1024 * 1024;
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // Match the on-device Clinical Assist OCR limit
export const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/jpg"]);

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.RENDER ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.FUNCTION_NAME
  );
}

export function getStorageProvider(): StorageProvider {
  const provider = (process.env.STORAGE_PROVIDER || "local").toLowerCase();
  if (provider === "r2") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./r2") as typeof import("./r2");
      return mod.createR2StorageProvider();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `STORAGE_PROVIDER=r2 but R2 adapter failed to load (${msg}). Configure valid R2 credentials or use the durable database fallback.`
      );
    }
  }
  if (provider === "processed") {
    // Explicit opt-in only. Lab-report uploads reject this provider because it
    // retains metadata but discards the original binary.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("./processed") as typeof import("./processed");
    return mod.createProcessedStorageProvider();
  }
  if (provider === "database" || isServerlessRuntime() || process.env.NODE_ENV === "production") {
    // Production must retain original report bytes. Postgres is the bounded,
    // durable fallback until R2 is explicitly configured.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("./database") as typeof import("./database");
    return mod.createDatabaseStorageProvider();
  }
  return createLocalStorageProvider();
}

export function buildStorageKey(
  clinicId: string,
  patientId: string,
  labOrderId: string | null,
  documentId: string,
  ext: string
) {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const orderPart = labOrderId || "no-order";
  return `clinics/${clinicId}/patients/${patientId}/labs/${orderPart}/${documentId}.${safeExt}`;
}
