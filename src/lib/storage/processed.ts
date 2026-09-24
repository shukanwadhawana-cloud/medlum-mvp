import type { StorageProvider, StoredObjectMeta } from "./types";

/**
 * Zero-cost process-only provider for serverless without object storage.
 * Binary is not retained; clinical safety relies on OCR draft + human verification.
 */
export function createProcessedStorageProvider(): StorageProvider {
  return {
    name: "processed",
    async upload(key: string, data: Buffer, mimeType: string): Promise<StoredObjectMeta> {
      return { key, sizeBytes: data.length, mimeType };
    },
    async getObject(_key: string) {
      return null;
    },
    async delete(_key: string) {
      /* no-op */
    },
  };
}
