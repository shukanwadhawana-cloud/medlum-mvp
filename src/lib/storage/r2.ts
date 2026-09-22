import type { StorageProvider, StoredObjectMeta } from "./types";

/**
 * Cloudflare R2 via S3-compatible API.
 * Free-tier safety is enforced in the application quota layer, not here.
 * Requires optional packages: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner
 */
export function createR2StorageProvider(): StorageProvider {
  const accountId = process.env.R2_ACCOUNT_ID || "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
  const bucket = process.env.R2_BUCKET || "";
  const endpoint =
    process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !endpoint) {
    throw new Error("R2 storage selected but R2_* environment variables are incomplete");
  }

  let S3Client: any;
  let PutObjectCommand: any;
  let GetObjectCommand: any;
  let DeleteObjectCommand: any;
  let getSignedUrl: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const s3 = require("@aws-sdk/client-s3");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const presigner = require("@aws-sdk/s3-request-presigner");
    S3Client = s3.S3Client;
    PutObjectCommand = s3.PutObjectCommand;
    GetObjectCommand = s3.GetObjectCommand;
    DeleteObjectCommand = s3.DeleteObjectCommand;
    getSignedUrl = presigner.getSignedUrl;
  } catch {
    throw new Error(
      "R2 requires @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner. Add them to dependencies or use STORAGE_PROVIDER=local."
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  return {
    name: "r2",
    async upload(key, data, mimeType): Promise<StoredObjectMeta> {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentType: mimeType,
        })
      );
      return { key, sizeBytes: data.length, mimeType };
    },
    async getObject(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = await res.Body?.transformToByteArray();
        if (!bytes) return null;
        return { data: Buffer.from(bytes), mimeType: res.ContentType || "application/octet-stream" };
      } catch {
        return null;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async getSignedUrl(key, expiresSeconds) {
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client, cmd, { expiresIn: expiresSeconds });
    },
  };
}
