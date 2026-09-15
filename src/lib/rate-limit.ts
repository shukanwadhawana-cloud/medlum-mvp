import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

type MemoryBucket = { count: number; resetAt: number };
const memory = new Map<string, MemoryBucket>();

function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xf) return xf.slice(0, 128);
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  return "unknown";
}

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.toLowerCase().trim()).digest("hex").slice(0, 32);
}

export function authBucketKey(kind: string, req: Request, identifier?: string): string {
  const ip = clientIp(req);
  const id = identifier ? hashIdentifier(identifier) : "anon";
  return `${kind}:${ip}:${id}`;
}

/**
 * DB-backed rate limit (shared across instances that share DATABASE_URL).
 * Falls back to process memory if the table is unavailable (documents residual risk).
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const retryAfterSec = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    const row = await prisma.authRateLimit.findUnique({ where: { key } });
    if (!row || row.resetAt.getTime() <= now) {
      const resetAt = new Date(now + windowMs);
      await prisma.authRateLimit.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSec };
    }

    if (row.count >= limit) {
      const wait = Math.max(1, Math.ceil((row.resetAt.getTime() - now) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec: wait };
    }

    await prisma.authRateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return { allowed: true, remaining: Math.max(0, limit - row.count - 1), retryAfterSec };
  } catch {
    // Table missing or DB error — process-local fallback (not multi-instance safe).
    const bucket = memory.get(key);
    if (!bucket || bucket.resetAt <= now) {
      memory.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSec };
    }
    if (bucket.count >= limit) {
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    bucket.count += 1;
    return { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfterSec };
  }
}

export function rateLimitResponse(retryAfterSec: number) {
  return {
    body: { success: false, error: "Too many attempts. Please try again later." },
    headers: {
      "Retry-After": String(retryAfterSec),
      "Cache-Control": "no-store",
    },
  };
}

/** Default windows for authentication endpoints. */
export const AUTH_LIMITS = {
  login: { limit: 20, windowMs: 15 * 60 * 1000 },
  signup: { limit: 10, windowMs: 60 * 60 * 1000 },
  portalLogin: { limit: 20, windowMs: 15 * 60 * 1000 },
  portalReset: { limit: 10, windowMs: 60 * 60 * 1000 },
} as const;
