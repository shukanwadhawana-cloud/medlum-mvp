/**
 * MedLum interoperability contracts.
 *
 * These are provider-neutral types. External credentials, network calls and
 * vendor SDKs stay outside the clinical core so MedLum can switch providers.
 */

export type InteropProvider = "EKA_ABDM" | "DIRECT_ABDM" | "UHI" | "NHCX" | "LAB" | "BLOOD_BANK";

export type AdapterCapability =
  | "ABHA"
  | "CONSENT"
  | "FHIR"
  | "APPOINTMENT_DISCOVERY"
  | "CLAIMS"
  | "BLOOD_AVAILABILITY"
  | "LAB_ORDERS"
  | "LAB_RESULTS"
  | "WEBHOOKS";

export type AdapterStatus = "planned" | "configured" | "connected" | "disabled";

export type InteropAdapterDescriptor = {
  id: string;
  provider: InteropProvider;
  name: string;
  status: AdapterStatus;
  capabilities: AdapterCapability[];
  requiresCredentials: boolean;
  productionReady: boolean;
};

export type FhirCoding = {
  system?: string;
  code?: string;
  display?: string;
};

export type FhirCodeableConcept = {
  coding?: FhirCoding[];
  text?: string;
};

export type FhirReference = {
  reference: string;
  display?: string;
};

export type FhirMeta = {
  profile?: string[];
  tag?: FhirCoding[];
};

export type FhirResource = {
  resourceType: string;
  id?: string;
  meta?: FhirMeta;
  [key: string]: unknown;
};

export type FhirBundle = {
  resourceType: "Bundle";
  type: "collection" | "transaction" | "searchset";
  entry?: Array<{ resource: FhirResource }>;
};

export type ConsentPurpose = "care" | "payment" | "research" | "other";

export type ConsentRequest = {
  patientId: string;
  purpose: ConsentPurpose;
  resources: Array<"Patient" | "Encounter" | "Observation" | "DiagnosticReport" | "MedicationRequest" | "ServiceRequest" | "DocumentReference">;
  periodStart?: string;
  periodEnd?: string;
  recipient?: string;
};

export type AdapterResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  provider: InteropProvider;
};
