import type { FhirCodeableConcept, FhirResource, FhirReference } from "./types";

type PatientInput = {
  id: string;
  name: string;
  gender: string;
  birthDate?: string;
  phone?: string;
};

type EncounterInput = {
  id: string;
  patientId: string;
  doctorId: string;
  date: string;
  chiefComplaint?: string;
  diagnosis?: string;
  assessment?: string;
  plan?: string;
};

type ObservationInput = {
  id: string;
  patientId: string;
  encounterId?: string;
  code: string;
  display: string;
  value: string;
  unit?: string;
  effectiveDate?: string;
};

type MedicationInput = {
  id: string;
  patientId: string;
  encounterId?: string;
  medicines: string;
  advice?: string;
  authoredOn?: string;
};

type ServiceRequestInput = {
  id: string;
  patientId: string;
  encounterId?: string;
  code: string;
  display: string;
  authoredOn?: string;
};

const reference = (type: string, id: string): FhirReference => ({ reference: `${type}/${id}` });
const concept = (text: string): FhirCodeableConcept => ({ text });

export function toFhirPatient(input: PatientInput): FhirResource {
  return {
    resourceType: "Patient",
    id: input.id,
    name: [{ text: input.name }],
    gender: input.gender.toLowerCase(),
    ...(input.birthDate ? { birthDate: input.birthDate } : {}),
    ...(input.phone ? { telecom: [{ system: "phone", value: input.phone }] } : {}),
  };
}

export function toFhirEncounter(input: EncounterInput): FhirResource {
  return {
    resourceType: "Encounter",
    id: input.id,
    status: "finished",
    class: { code: "AMB", display: "ambulatory" },
    subject: reference("Patient", input.patientId),
    participant: [{ individual: reference("Practitioner", input.doctorId) }],
    period: { start: input.date },
    ...(input.chiefComplaint ? { reasonCode: [concept(input.chiefComplaint)] } : {}),
    ...(input.diagnosis || input.assessment || input.plan
      ? { extension: [{ url: "https://medlum.app/fhir/clinical-summary", valueString: [input.diagnosis, input.assessment, input.plan].filter(Boolean).join(" | ") }] }
      : {}),
  };
}

export function toFhirObservation(input: ObservationInput): FhirResource {
  return {
    resourceType: "Observation",
    id: input.id,
    status: "final",
    code: concept(input.display),
    subject: reference("Patient", input.patientId),
    ...(input.encounterId ? { encounter: reference("Encounter", input.encounterId) } : {}),
    ...(input.effectiveDate ? { effectiveDateTime: input.effectiveDate } : {}),
    valueQuantity: {
      value: Number(input.value),
      ...(input.unit ? { unit: input.unit } : {}),
    },
    extension: [{ url: "https://medlum.app/fhir/source-code", valueString: input.code }],
  };
}

export function toFhirMedicationRequest(input: MedicationInput): FhirResource {
  return {
    resourceType: "MedicationRequest",
    id: input.id,
    status: "active",
    intent: "order",
    subject: reference("Patient", input.patientId),
    ...(input.encounterId ? { encounter: reference("Encounter", input.encounterId) } : {}),
    ...(input.authoredOn ? { authoredOn: input.authoredOn } : {}),
    medicationCodeableConcept: concept(input.medicines),
    ...(input.advice ? { note: [{ text: input.advice }] } : {}),
  };
}

export function toFhirServiceRequest(input: ServiceRequestInput): FhirResource {
  return {
    resourceType: "ServiceRequest",
    id: input.id,
    status: "active",
    intent: "order",
    code: concept(input.display),
    subject: reference("Patient", input.patientId),
    ...(input.encounterId ? { encounter: reference("Encounter", input.encounterId) } : {}),
    ...(input.authoredOn ? { authoredOn: input.authoredOn } : {}),
    extension: [{ url: "https://medlum.app/fhir/source-code", valueString: input.code }],
  };
}
