import type { InteropProvider } from "./types";

export type InteropEventKind =
  | "CONSENT_REQUESTED"
  | "CONSENT_GRANTED"
  | "CONSENT_DENIED"
  | "CARE_CONTEXT_LINKED"
  | "HEALTH_INFORMATION_REQUESTED"
  | "HEALTH_INFORMATION_RECEIVED"
  | "UNKNOWN";

export type NormalizedInteropEvent = {
  provider: InteropProvider;
  kind: InteropEventKind;
  transactionId: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
};

const EVENT_MAP: Record<string, InteropEventKind> = {
  CONSENT_REQUEST: "CONSENT_REQUESTED",
  CONSENT_REQUESTED: "CONSENT_REQUESTED",
  CONSENT_GRANTED: "CONSENT_GRANTED",
  CONSENT_DENIED: "CONSENT_DENIED",
  CARE_CONTEXT_LINKED: "CARE_CONTEXT_LINKED",
  HEALTH_INFORMATION_REQUEST: "HEALTH_INFORMATION_REQUESTED",
  HEALTH_INFORMATION_RECEIVED: "HEALTH_INFORMATION_RECEIVED",
};

export function normalizeInteropEvent(input: {
  provider: InteropProvider;
  event?: string | null;
  transactionId?: string | null;
  payload?: unknown;
  timestamp?: string | null;
}): NormalizedInteropEvent {
  const payload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
    ? input.payload as Record<string, unknown>
    : {};

  const rawEvent = String(input.event || "").trim().toUpperCase();

  return {
    provider: input.provider,
    kind: EVENT_MAP[rawEvent] || "UNKNOWN",
    transactionId: input.transactionId || null,
    timestamp: input.timestamp || new Date().toISOString(),
    payload,
  };
}
