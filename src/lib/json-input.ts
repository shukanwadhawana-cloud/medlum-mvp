/**
 * Tolerant JSON object normalization for user-facing optional metadata fields.
 * Preserves valid objects; wraps plain text; rejects oversized payloads.
 * Output is structurally compatible with Prisma Json / InputJsonObject.
 */

/** Plain object suitable for Prisma Json columns (no arrays at root). */
export type NormalizedJsonObject = { [key: string]: unknown };

const DEFAULT_MAX_BYTES = 20_000;

/**
 * Parse a value that may be an object, a JSON string, plain text, null, or undefined.
 * - Valid object → returned as-is (shallow object only, not array)
 * - Valid JSON object string → parsed object
 * - Plain text / non-object JSON → { details: raw } so input is not discarded
 * - Empty / null / undefined → fallback
 */
export function parseJsonObject(
  value: unknown,
  fallback: NormalizedJsonObject = {},
): NormalizedJsonObject {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as NormalizedJsonObject;
  }
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as NormalizedJsonObject;
    }
    return { details: raw };
  } catch {
    return { details: raw };
  }
}

/**
 * Parse + enforce a maximum serialized size. Throws a user-safe Error on overflow.
 */
export function assertJsonObjectSize(
  value: unknown,
  maxBytes = DEFAULT_MAX_BYTES,
): NormalizedJsonObject {
  const parsed = parseJsonObject(value);
  let size: number;
  try {
    size = JSON.stringify(parsed).length;
  } catch {
    throw new Error("Record details could not be serialized.");
  }
  if (size > maxBytes) {
    throw new Error("Record details are too large.");
  }
  return parsed;
}
