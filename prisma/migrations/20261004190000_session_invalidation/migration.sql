-- Add server-side session invalidation without changing existing clinical records.
ALTER TABLE "Doctor"
ADD COLUMN IF NOT EXISTS "sessionInvalidatedAt" TIMESTAMP(3);