import { prisma } from "@/lib/db";
import type { StorageProvider, StoredObjectMeta } from "./types";

const DEFAULT_DATABASE_STORAGE_QUOTA_BYTES = 256 * 1024 * 1024;

function quotaBytes(): number {
  const raw = process.env.STORAGE_QUOTA_BYTES || process.env.DATABASE_STORAGE_QUOTA_BYTES || "";
  return /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : DEFAULT_DATABASE_STORAGE_QUOTA_BYTES;
}

/**
 * Durable fallback when object storage credentials are not configured.
 * Files are stored as PostgreSQL bytea rows and are always read through an
 * authorized MedicalDocument route. This fallback is quota-limited so report
 * binaries cannot silently consume the entire clinical database.
 */
export function createDatabaseStorageProvider(): StorageProvider {
  return {
    name: "database",
    async upload(key, data, mimeType): Promise<StoredObjectMeta> {
      if (!Buffer.isBuffer(data) || data.length === 0) {
        throw new Error("Cannot store an empty lab report.");
      }
      const clinicMatch = /^clinics\/([^/]+)\//.exec(key);
      const clinicId = clinicMatch?.[1];
      if (!clinicId) throw new Error("Report storage key does not include a clinic scope.");

      await prisma.$transaction(async (tx) => {
        const current = await tx.storedBinaryObject.findUnique({
          where: { key },
          select: { sizeBytes: true, clinicId: true },
        });
        if (current && current.clinicId !== clinicId) {
          throw new Error("Stored report key belongs to a different clinic.");
        }
        const usage = await tx.storedBinaryObject.aggregate({
          where: { clinicId },
          _sum: { sizeBytes: true },
        });
        const usedBytes = usage._sum.sizeBytes || 0;
        const projectedBytes = usedBytes - (current?.sizeBytes || 0) + data.length;
        const quota = quotaBytes();
        if (projectedBytes > quota) {
          throw new Error(
            `Durable report storage quota exceeded (${usedBytes} of ${quota} bytes used). Configure STORAGE_PROVIDER=r2 with valid R2 credentials, or free report storage space.`
          );
        }

        await tx.storedBinaryObject.upsert({
          where: { key },
          create: {
            key,
            clinicId,
            data,
            mimeType,
            sizeBytes: data.length,
          },
          update: {
            clinicId,
            data,
            mimeType,
            sizeBytes: data.length,
          },
        });
      }, { isolationLevel: "Serializable" });

      return { key, sizeBytes: data.length, mimeType };
    },

    async getObject(key) {
      const row = await prisma.storedBinaryObject.findUnique({
        where: { key },
        select: { data: true, mimeType: true },
      });
      if (!row) return null;
      return { data: Buffer.from(row.data), mimeType: row.mimeType };
    },

    async delete(key) {
      await prisma.storedBinaryObject.deleteMany({ where: { key } });
    },
  };
}
