import { PrismaClient } from "@prisma/client";

const RETRYABLE_READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

const TRANSIENT_DATABASE_CODES = new Set([
  "P1001", // database server unreachable
  "P1002", // database connection timed out
  "P1008", // operation timed out
  "P1017", // server closed the connection
  "P2024", // connection-pool timeout
]);

function isTransientDatabaseError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; errorCode?: unknown };
    const code = String(candidate.code ?? candidate.errorCode ?? "");
    if (TRANSIENT_DATABASE_CODES.has(code)) return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket hang up|server closed the connection unexpectedly|connection terminated unexpectedly/i.test(
    message
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validates only the URL shape. Never returns or logs the URL because it
 * contains production database credentials.
 */
export function isDatabaseUrlValid(value = process.env.DATABASE_URL): boolean {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "postgresql:" || parsed.protocol === "postgres:") &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Cold Neon computes and short network interruptions can briefly reject the
 * first query. Retry transient failures only; never retry writes because a
 * write may have committed even when its response was lost.
 */
export async function withDatabaseRecovery<T>(
  operation: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
      await wait(300 * 2 ** attempt);
    }
  }

  throw lastError;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  const extendedClient = client.$extends({
    query: {
      $allOperations({ operation, args, query }) {
        if (!RETRYABLE_READ_OPERATIONS.has(operation)) {
          return query(args);
        }

        return withDatabaseRecovery(() => Promise.resolve(query(args)));
      },
    },
  });

  // Preserve the standard PrismaClient public type for existing transaction
  // helpers while retaining the runtime read-retry extension.
  return extendedClient as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
