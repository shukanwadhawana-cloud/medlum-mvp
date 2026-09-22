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
        `STORAGE_PROVIDER=r2 but R2 adapter failed to load (${msg}). Install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner, and configure R2 credentials.`
      );
    }
  }
  // Local filesystem is not durable on serverless (ENOENT under /var/task).
  if (isServerlessRuntime() || process.env.NODE_ENV === "production") {
    throw new Error(
      "Secure medical document storage is not configured. Set STORAGE_PROVIDER=r2 with R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (and optional R2_ENDPOINT). Local filesystem storage is not available on production/serverless hosts."
    );
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
