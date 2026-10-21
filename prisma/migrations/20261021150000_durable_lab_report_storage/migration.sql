-- Durable fallback for original report binaries when object storage is not configured.
CREATE TABLE "StoredBinaryObject" (
  "key" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoredBinaryObject_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "StoredBinaryObject_clinicId_createdAt_idx" ON "StoredBinaryObject"("clinicId", "createdAt");
