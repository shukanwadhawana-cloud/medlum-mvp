export function parseJsonObject(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : fallback;
  } catch {
    return { details: raw };
  }
}

export function assertJsonObjectSize(value: unknown, maxBytes = 20000): Record<string, unknown> {
  const parsed = parseJsonObject(value);
  if (JSON.stringify(parsed).length > maxBytes) throw new Error("Record details are too large.");
  return parsed;
}
