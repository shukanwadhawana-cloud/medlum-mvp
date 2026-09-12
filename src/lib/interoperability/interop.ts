import type { AdapterCapability, AdapterResult, FhirBundle, FhirResource, InteropProvider } from "./types";
import { INTEROP_ADAPTERS } from "./adapters";

/** Provider-neutral interoperability gateway.
 *
 * The clinical core talks to this gateway using capabilities, never vendor
 * names. Real network adapters can be registered later without changing the
 * patient/encounter workflow.
 */
export type InteropOperation =
  | "export_fhir"
  | "request_consent"
  | "create_abha"
  | "discover_appointments"
  | "submit_claim"
  | "discover_blood"
  | "send_lab_order"
  | "receive_lab_result";

const capabilityFor: Record<InteropOperation, AdapterCapability> = {
  export_fhir: "FHIR",
  request_consent: "CONSENT",
  create_abha: "ABHA",
  discover_appointments: "APPOINTMENT_DISCOVERY",
  submit_claim: "CLAIMS",
  discover_blood: "BLOOD_AVAILABILITY",
  send_lab_order: "LAB_ORDERS",
  receive_lab_result: "LAB_RESULTS",
};

export function providersFor(operation: InteropOperation) {
  const capability = capabilityFor[operation];
  return INTEROP_ADAPTERS.filter((adapter) => adapter.capabilities.includes(capability));
}

export function validateProviderForOperation(provider: InteropProvider, operation: InteropOperation): AdapterResult<{ provider: InteropProvider }> {
  const adapter = INTEROP_ADAPTERS.find((item) => item.provider === provider);
  if (!adapter) return { ok: false, provider, error: "Unknown interoperability provider." };
  const capability = capabilityFor[operation];
  if (!adapter.capabilities.includes(capability)) return { ok: false, provider, error: `Provider does not support ${operation}.` };
  return { ok: true, provider, data: { provider } };
}

export function buildExportBundle(resources: FhirResource[]): AdapterResult<FhirBundle> {
  return {
    ok: true,
    provider: "DIRECT_ABDM",
    data: { resourceType: "Bundle", type: "collection", entry: resources.map((resource) => ({ resource })) },
  };
}
