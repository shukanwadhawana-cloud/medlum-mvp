import type { AdapterCapability, AdapterResult, ConsentRequest, FhirBundle, FhirResource, InteropAdapterDescriptor, InteropProvider } from "./types";

const planned = (id: string, provider: InteropProvider, name: string, capabilities: AdapterCapability[], requiresCredentials = true): InteropAdapterDescriptor => ({
  id,
  provider,
  name,
  status: "planned",
  capabilities,
  requiresCredentials,
  productionReady: false,
});

/**
 * Provider registry. These are intentionally capability-only descriptors.
 * No network request is made until a provider is explicitly configured.
 */
export const INTEROP_ADAPTERS: InteropAdapterDescriptor[] = [
  planned("eka-abdm", "EKA_ABDM", "Eka Care ABDM Connect", ["ABHA", "CONSENT", "FHIR", "WEBHOOKS"]),
  planned("direct-abdm", "DIRECT_ABDM", "ABDM Direct", ["ABHA", "CONSENT", "FHIR", "WEBHOOKS"]),
  planned("uhi", "UHI", "Unified Health Interface", ["APPOINTMENT_DISCOVERY"]),
  planned("nhcx", "NHCX", "National Health Claims Exchange", ["CLAIMS"]),
  planned("blood-bank", "BLOOD_BANK", "Blood-bank discovery", ["BLOOD_AVAILABILITY"]),
  planned("external-labs", "LAB", "External laboratory connector", ["LAB_ORDERS", "LAB_RESULTS", "FHIR"]),
];

export function getAdapter(id: string): InteropAdapterDescriptor | undefined {
  return INTEROP_ADAPTERS.find((adapter) => adapter.id === id);
}

export function getAdaptersByCapability(capability: AdapterCapability): InteropAdapterDescriptor[] {
  return INTEROP_ADAPTERS.filter((adapter) => adapter.capabilities.includes(capability));
}

/**
 * Consent is represented as a provider-neutral command first. The actual ABDM
 * consent transaction is implemented by an adapter after credentials/onboarding.
 */
export function buildConsentRequest(input: ConsentRequest): ConsentRequest {
  return {
    ...input,
    patientId: input.patientId.trim(),
    recipient: input.recipient?.trim() || undefined,
  };
}

export function emptyInteropResult<T>(provider: InteropProvider, error: string): AdapterResult<T> {
  return { ok: false, provider, error };
}

export function collectionBundle(resources: FhirResource[]): FhirBundle {
  return {
    resourceType: "Bundle",
    type: "collection",
    entry: resources.map((resource) => ({ resource })),
  };
}
