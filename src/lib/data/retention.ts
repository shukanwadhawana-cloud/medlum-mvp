export const MEDLUM_DATA_POLICY_VERSION = "1.0";

/**
 * MedLum is the system of record for durable clinical and operational data.
 * External interoperability/video providers must not be treated as the
 * canonical store for these records.
 */
export const MEDLUM_SYSTEM_OF_RECORD = {
  patientRecords: "MEDLUM_DB",
  encounters: "MEDLUM_DB",
  prescriptions: "MEDLUM_DB",
  pharmacyTransactions: "MEDLUM_DB",
  appointments: "MEDLUM_DB",
  billing: "MEDLUM_DB",
  auditLogs: "MEDLUM_DB",
  abdmInteroperability: "EKA_ABDM",
  liveVideo: "VIDEO_PROVIDER",
} as const;

export type MedLumRecordClass = keyof typeof MEDLUM_SYSTEM_OF_RECORD;

export function canonicalStoreFor(recordClass: MedLumRecordClass) {
  return MEDLUM_SYSTEM_OF_RECORD[recordClass];
}
