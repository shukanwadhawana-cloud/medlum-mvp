export type StoredObjectMeta = {
  key: string;
  sizeBytes: number;
  mimeType: string;
};

export interface StorageProvider {
  name: string;
  upload(key: string, data: Buffer, mimeType: string): Promise<StoredObjectMeta>;
  getObject(key: string): Promise<{ data: Buffer; mimeType: string } | null>;
  delete(key: string): Promise<void>;
  /** Optional signed URL; local provider returns null (use app stream route). */
  getSignedUrl?(key: string, expiresSeconds: number): Promise<string | null>;
}
