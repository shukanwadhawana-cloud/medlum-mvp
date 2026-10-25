import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const MIGRATION_SCHEMA_VERSION = 2;

type ScopeContext = {
  clinicId: string;
  doctorIds: string[];
  patientIds: string[];
  appointmentIds: string[];
  encounterIds: string[];
  prescriptionIds: string[];
  invoiceIds: string[];
  labOrderIds: string[];
  diagnosticOrderIds: string[];
  tariffVersionIds: string[];
  labTemplateIds: string[];
  insuranceProviderIds: string[];
  insurancePolicyIds: string[];
  bloodInventoryIds: string[];
  sessionIds: string[];
  memberIds: string[];
};

type ModelSpec = {
  table: string;
  where: (c: ScopeContext) => { sql: string; params: unknown[] };
  sensitive?: string[];
};

const anyOf = (column: string, values: string[]) =>
  values.length ? { sql: `"${column}" = ANY($1::text[])`, params: [values] } : { sql: "FALSE", params: [] };

const specs: ModelSpec[] = [
  { table: "Clinic", where: c => ({ sql: `"id" = $1`, params: [c.clinicId] }) },
  { table: "ClinicMember", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "Doctor", where: c => anyOf("id", c.doctorIds), sensitive: ["passwordHash"] },
  { table: "Patient", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "Appointment", where: c => anyOf("patientId", c.patientIds) },
  { table: "Encounter", where: c => anyOf("patientId", c.patientIds) },
  { table: "Prescription", where: c => anyOf("patientId", c.patientIds) },
  { table: "Invoice", where: c => ({ sql: `("clinicId" = $1 OR ("clinicId" IS NULL AND "patientId" = ANY($2::text[])))`, params: [c.clinicId, c.patientIds] }) },
  { table: "InvoiceItem", where: c => anyOf("invoiceId", c.invoiceIds) },
  { table: "Payment", where: c => ({ sql: `("patientId" = ANY($1::text[]) OR "invoiceId" = ANY($2::text[]))`, params: [c.patientIds, c.invoiceIds] }) },
  { table: "LabOrder", where: c => anyOf("patientId", c.patientIds) },
  { table: "PharmacyItem", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "Dispensing", where: c => ({ sql: `("patientId" = ANY($1::text[]) OR "prescriptionId" = ANY($2::text[]))`, params: [c.patientIds, c.prescriptionIds] }) },
  { table: "MedicationAdministration", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "DiagnosticOrder", where: c => anyOf("patientId", c.patientIds) },
  { table: "BloodInventory", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "BloodDonor", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "BloodRequest", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "InsuranceProvider", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "InsurancePolicy", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "InsuranceClaim", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "WorkforceRecord", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "ClinicalNote", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "ClinicalNoteVersion", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "TelemedicineSession", where: c => ({ sql: `("clinicId" = $1 OR ("clinicId" IS NULL AND ("patientId" = ANY($2::text[]) OR "appointmentId" = ANY($3::text[]))))`, params: [c.clinicId, c.patientIds, c.appointmentIds] }), sensitive: ["joinTokenHash", "meetingUrl"] },
  { table: "TelemedicineParticipant", where: c => anyOf("sessionId", c.sessionIds), sensitive: ["tokenHash"] },
  { table: "PatientPortalAccount", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }), sensitive: ["passwordHash"] },
  { table: "TariffVersion", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "TariffItem", where: c => anyOf("tariffVersionId", c.tariffVersionIds) },
  { table: "LabTemplate", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "LabTemplateParameter", where: c => anyOf("templateId", c.labTemplateIds) },
  { table: "AbdmConsent", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "AbdmCareContext", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "AbdmEvent", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "EmergencyCase", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "MedicalDocument", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }), sensitive: ["storageKey"] },
  { table: "DutyAttendanceEvent", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "DutyAttendanceRequest", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
];

function withoutSensitive(row: Record<string, unknown>, sensitive: string[] = []) {
  const copy = { ...row };
  for (const key of sensitive) delete copy[key];
  return copy;
}

async function ids(table: string, where: { sql: string; params: unknown[] }): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "${table}" WHERE ${where.sql}`,
    ...where.params,
  );
  return rows.map(r => r.id);
}

export async function exportClinicData(clinicId: string, ownerEmail: string) {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true, address: true, phone: true, email: true, website: true, registrationNo: true, isActive: true, createdAt: true, updatedAt: true } });
  if (!clinic) throw new Error("Clinic not found");

  const memberRows = await prisma.clinicMember.findMany({ where: { clinicId }, select: { id: true, clinicId: true, doctorId: true, role: true, staffCode: true, designation: true, department: true, isActive: true, deactivatedAt: true, createdAt: true, updatedAt: true } });
  const doctorIds = [...new Set(memberRows.map(m => m.doctorId))];
  const patientRows = await prisma.patient.findMany({ where: { clinicId } });
  const patientIds = patientRows.map(p => p.id);
  const base: ScopeContext = { clinicId, doctorIds, patientIds, appointmentIds: [], encounterIds: [], prescriptionIds: [], invoiceIds: [], labOrderIds: [], diagnosticOrderIds: [], tariffVersionIds: [], labTemplateIds: [], insuranceProviderIds: [], insurancePolicyIds: [], bloodInventoryIds: [], sessionIds: [], memberIds: memberRows.map(m => m.id) };

  const appointmentIds = await ids("Appointment", specs.find(s => s.table === "Appointment")!.where(base)); base.appointmentIds = appointmentIds;
  const encounterIds = await ids("Encounter", specs.find(s => s.table === "Encounter")!.where(base)); base.encounterIds = encounterIds;
  const prescriptionIds = await ids("Prescription", specs.find(s => s.table === "Prescription")!.where(base)); base.prescriptionIds = prescriptionIds;
  const invoiceIds = await ids("Invoice", specs.find(s => s.table === "Invoice")!.where(base)); base.invoiceIds = invoiceIds;
  const labOrderIds = await ids("LabOrder", specs.find(s => s.table === "LabOrder")!.where(base)); base.labOrderIds = labOrderIds;
  const diagnosticOrderIds = await ids("DiagnosticOrder", specs.find(s => s.table === "DiagnosticOrder")!.where(base)); base.diagnosticOrderIds = diagnosticOrderIds;
  base.tariffVersionIds = await ids("TariffVersion", specs.find(s => s.table === "TariffVersion")!.where(base));
  base.labTemplateIds = await ids("LabTemplate", specs.find(s => s.table === "LabTemplate")!.where(base));
  base.insuranceProviderIds = await ids("InsuranceProvider", specs.find(s => s.table === "InsuranceProvider")!.where(base));
  base.insurancePolicyIds = await ids("InsurancePolicy", specs.find(s => s.table === "InsurancePolicy")!.where(base));
  base.bloodInventoryIds = await ids("BloodInventory", specs.find(s => s.table === "BloodInventory")!.where(base));
  base.sessionIds = await ids("TelemedicineSession", specs.find(s => s.table === "TelemedicineSession")!.where(base));

  const records: Record<string, unknown[]> = { Clinic: [clinic], ClinicMember: memberRows, Patient: patientRows };
  for (const spec of specs) {
    if (["Clinic", "ClinicMember", "Patient"].includes(spec.table)) continue;
    const where = spec.where(base);
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${spec.table}" WHERE ${where.sql}`,
      ...where.params,
    );
    records[spec.table] = rows.map(r => withoutSensitive(r, spec.sensitive));
  }
  // Doctor accounts are global identities; export only the fields required to map existing accounts safely.
  records.Doctor = (records.Doctor || []).map(r => {
    const row = r as Record<string, unknown>;
    return { id: row.id, email: row.email, name: row.name };
  });

  return {
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    source: { clinicId, clinicName: clinic.name, ownerEmail },
    protection: { ownerEmail, note: "The current MedLum Master Owner is never replaced by imported records." },
    notMigrated: ["Patients with null clinicId are excluded because their facility ownership cannot be proven", "AuditLog (source audit history is retained at the source)", "FacilityTelegramIntegration (must be rebound to the target facility)", "TelegramIdentity (global identity; never copied)", "TelegramLinkChallenge (one-time credentials are never copied)", "TelemedicineSession credentials/URLs (re-establish live sessions after import)"],
    records,
  };
}

export function validateMigrationPackage(pkg: unknown) {
  if (!pkg || typeof pkg !== "object") throw new Error("Import package must be a JSON object");
  const p = pkg as Record<string, unknown>;
  if (p.schemaVersion !== MIGRATION_SCHEMA_VERSION) throw new Error("Unsupported migration package version");
  if (!p.records || typeof p.records !== "object" || Array.isArray(p.records)) throw new Error("Migration package has no records object");
  const records = p.records as Record<string, unknown>;
  const allowed = new Set(specs.map(s => s.table));
  const errors: string[] = [];
  const sensitiveKeys = new Set(["passwordHash", "encryptedToken", "connectionCodeHash", "tokenHash", "storageKey", "joinTokenHash", "meetingUrl"]);
  for (const [table, rows] of Object.entries(records)) {
    if (!allowed.has(table)) errors.push(`Unsupported table: ${table}`);
    if (!Array.isArray(rows)) {
      errors.push(`Records for ${table} must be an array`);
      continue;
    }
    if (rows.length > 20000) errors.push(`${table} exceeds the per-table import limit (20,000)`);
    const seenIds = new Set<string>();
    rows.forEach((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push(`${table} row ${index + 1} must be an object`);
        return;
      }
      const row = raw as Record<string, unknown>;
      if (typeof row.id !== "string" || !row.id.trim()) {
        errors.push(`${table} row ${index + 1} must have a non-empty string id`);
      } else if (seenIds.has(row.id)) {
        errors.push(`${table} contains duplicate id ${row.id}`);
      } else {
        seenIds.add(row.id);
      }
      for (const key of sensitiveKeys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) errors.push(`${table} row ${index + 1} contains a forbidden credential/storage field: ${key}`);
      }
      if (table === "ClinicalNoteVersion") {
        const version = row.version;
        const noteContent = row.content;
        const contentHash = row.contentHash;
        if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || typeof noteContent !== "string" || typeof contentHash !== "string") {
          errors.push(table + " row " + (index + 1) + " is missing valid version/content/hash fields");
        } else {
          const expectedHash = createHash("sha256").update("v" + version + ":\n" + noteContent).digest("hex");
          if (contentHash !== expectedHash) errors.push(table + " row " + (index + 1) + " content hash does not match its content");
        }
      }
    
    });
  }
  if (!Array.isArray(records.Clinic) || records.Clinic.length !== 1) {
    errors.push("Migration package must contain exactly one source Clinic record");
  }
  const size = Buffer.byteLength(JSON.stringify(pkg), "utf8");
  if (size > 20 * 1024 * 1024) errors.push("Import package exceeds 20 MB");
  return { valid: errors.length === 0, errors, sizeBytes: size };
}


const IMPORT_ORDER = [
  "Doctor", "ClinicMember", "Patient", "Appointment", "Encounter", "Prescription",
  "TariffVersion", "TariffItem", "Invoice", "InvoiceItem", "Payment", "LabOrder",
  "PharmacyItem", "Dispensing", "DiagnosticOrder", "BloodInventory", "BloodDonor",
  "BloodRequest", "InsuranceProvider", "InsurancePolicy", "InsuranceClaim",
  "WorkforceRecord", "MedicationAdministration", "LabTemplate", "LabTemplateParameter",
  "AbdmConsent", "AbdmCareContext", "AbdmEvent", "EmergencyCase", "DutyAttendanceEvent",
  "DutyAttendanceRequest", "ClinicalNote", "ClinicalNoteVersion",
];

const DEFERRED_IMPORT_TABLES = new Set([
  "MedicalDocument", "PatientPortalAccount", "FacilityTelegramIntegration",
  "TelegramIdentity", "TelegramLinkChallenge", "TelemedicineParticipant", "TelemedicineSession",
]);

const ID_KEYS = new Set([
  "clinicId", "doctorId", "patientId", "appointmentId", "encounterId",
  "prescriptionId", "invoiceId", "labOrderId", "diagnosticOrderId", "inventoryId",
  "providerId", "policyId", "administeringMemberId", "tariffVersionId",
  "tariffItemId", "templateId", "sessionId", "claimId", "documentId", "clinicalNoteId", "createdByDoctorId", "uploadedBy",
  "authorDoctorId", "verifierDoctorId", "createdBy", "cancelledBy", "deletedBy",
  "reviewerDoctorId", "adminDoctorId",
]);

function remapIds(row: Record<string, unknown>, idMap: Map<string, string>, table?: string) {
  const out = { ...row };
  for (const key of Object.keys(out)) {
    const value = out[key];
    const isForeignKey = ID_KEYS.has(key) || (table === "WorkforceRecord" && key === "memberId");
    if (typeof value === "string" && idMap.has(value) && isForeignKey) {
      out[key] = idMap.get(value);
    }
  }
  return out;
}

async function tableHasId(table: string, id: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "${table}" WHERE "id" = $1 LIMIT 1`,
    id,
  );
  return rows.length > 0;
}

async function insertRow(table: string, row: Record<string, unknown>) {
  const safeRow = { ...row };
  for (const key of ["passwordHash", "encryptedToken", "connectionCodeHash", "tokenHash", "storageKey", "joinTokenHash", "meetingUrl"]) {
    delete safeRow[key];
  }
  const keys = Object.keys(safeRow).filter(k => safeRow[k] !== undefined);
  if (!keys.length) return;
  const cols = keys.map(k => `"${k.replace(/"/g, '""')}"`).join(", ");
  const selects = keys.map(k => `(jsonb_populate_record(NULL::"${table}", $1::jsonb))."${k.replace(/"/g, '""')}"`).join(", ");
  await prisma.$queryRawUnsafe(
    `INSERT INTO "${table}" (${cols}) SELECT ${selects}`,
    JSON.stringify(safeRow),
  );
}

export async function importClinicData(
  pkg: unknown,
  targetClinicId: string,
  ownerEmail: string,
  options: { execute: boolean },
) {
  const validation = validateMigrationPackage(pkg);
  if (!validation.valid) return { valid: false, executed: false, errors: validation.errors, imported: {}, deferred: [] as string[] };

  const records = (pkg as { records: Record<string, unknown[]> }).records;
  const sourceClinic = Array.isArray(records.Clinic) ? records.Clinic[0] as Record<string, unknown> | undefined : undefined;
  const sourceClinicId = typeof sourceClinic?.id === "string" ? sourceClinic.id : "";
  if (!sourceClinicId) return { valid: false, executed: false, errors: ["Migration package is missing its source Clinic record."], imported: {}, deferred: [] as string[] };

  const targetClinic = await prisma.clinic.findUnique({ where: { id: targetClinicId }, select: { id: true, name: true } });
  if (!targetClinic) return { valid: false, executed: false, errors: ["Target facility not found."], imported: {}, deferred: [] as string[] };

  const owner = await prisma.doctor.findUnique({ where: { email: ownerEmail }, select: { id: true, email: true } });
  if (!owner) return { valid: false, executed: false, errors: ["Current Master Owner account could not be resolved."], imported: {}, deferred: [] as string[] };

  const idMap = new Map<string, string>([[sourceClinicId, targetClinicId]]);
  const errors: string[] = [];
  const imported: Record<string, number> = {};
  const deferred = [...DEFERRED_IMPORT_TABLES].filter(t => Array.isArray(records[t]) && records[t].length > 0);

  // Authentication credentials are deliberately not migrated. Staff must already exist
  // in MedLum or be provisioned through the normal account flow before clinical data import.
  for (const row of (records.Doctor || []) as Record<string, unknown>[]) {
    const sourceId = typeof row.id === "string" ? row.id : "";
    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    if (!sourceId || !email) { errors.push("Every Doctor record needs id and email."); continue; }
    if (email === ownerEmail.trim().toLowerCase()) {
      idMap.set(sourceId, owner.id);
      continue;
    }
    const existing = await prisma.doctor.findUnique({ where: { email }, select: { id: true } });
    if (!existing) errors.push(`Doctor ${email} is not provisioned in MedLum; create the account first, then retry.`);
    else idMap.set(sourceId, existing.id);
  }

  if (errors.length) return { valid: false, executed: false, errors, imported: {}, deferred };

  // Validate foreign keys against the source package before writing anything. A row
  // must never retain a foreign key to an unrelated record in the target database.
  const sourceIdsByTable = new Map<string, Set<string>>();
  for (const [table, rows] of Object.entries(records)) {
    if (!Array.isArray(rows)) continue;
    sourceIdsByTable.set(table, new Set(
      rows.map(row => (row as Record<string, unknown>).id).filter((id): id is string => typeof id === "string" && id.length > 0),
    ));
  }
  const foreignKeyTargets: Record<string, Record<string, string>> = {
    ClinicMember: { doctorId: "Doctor" },
    Patient: { doctorId: "Doctor", deletedBy: "Doctor" },
    Appointment: { doctorId: "Doctor", patientId: "Patient" },
    Encounter: { doctorId: "Doctor", patientId: "Patient", appointmentId: "Appointment", cancelledBy: "Doctor" },
    Prescription: { doctorId: "Doctor", patientId: "Patient", encounterId: "Encounter", cancelledBy: "Doctor" },
    Invoice: { doctorId: "Doctor", patientId: "Patient", tariffVersionId: "TariffVersion" },
    InvoiceItem: { invoiceId: "Invoice", tariffVersionId: "TariffVersion", tariffItemId: "TariffItem" },
    TariffItem: { tariffVersionId: "TariffVersion" },
    Payment: { invoiceId: "Invoice", doctorId: "Doctor", patientId: "Patient" },
    LabOrder: { doctorId: "Doctor", patientId: "Patient", encounterId: "Encounter" },
    PharmacyItem: { doctorId: "Doctor" },
    Dispensing: { doctorId: "Doctor", patientId: "Patient", prescriptionId: "Prescription" },
    DiagnosticOrder: { doctorId: "Doctor", patientId: "Patient", encounterId: "Encounter" },
    BloodRequest: { patientId: "Patient", doctorId: "Doctor", inventoryId: "BloodInventory" },
    InsurancePolicy: { patientId: "Patient", providerId: "InsuranceProvider" },
    InsuranceClaim: { patientId: "Patient", policyId: "InsurancePolicy", invoiceId: "Invoice" },
    WorkforceRecord: { memberId: "ClinicMember", createdBy: "Doctor" },
    MedicationAdministration: { patientId: "Patient", prescriptionId: "Prescription", encounterId: "Encounter", administeringMemberId: "ClinicMember" },
    LabTemplateParameter: { templateId: "LabTemplate" },
    AbdmConsent: { patientId: "Patient", doctorId: "Doctor" },
    AbdmCareContext: { patientId: "Patient", doctorId: "Doctor" },
    EmergencyCase: { patientId: "Patient", doctorId: "Doctor" },
    DutyAttendanceEvent: { memberId: "ClinicMember", doctorId: "Doctor", adminDoctorId: "Doctor" },
    DutyAttendanceRequest: { memberId: "ClinicMember", doctorId: "Doctor", reviewerDoctorId: "Doctor" },
    ClinicalNote: { patientId: "Patient", encounterId: "Encounter", authorDoctorId: "Doctor", verifierDoctorId: "Doctor" },
    ClinicalNoteVersion: { clinicalNoteId: "ClinicalNote", createdByDoctorId: "Doctor" },
  };
  for (const [table, fields] of Object.entries(foreignKeyTargets)) {
    const rows = records[table];
    if (!Array.isArray(rows)) continue;
    rows.forEach((raw, index) => {
      const row = raw as Record<string, unknown>;
      for (const [field, targetTable] of Object.entries(fields)) {
        const value = row[field];
        if (value === null || value === undefined || value === "") continue;
        if (typeof value !== "string" || !sourceIdsByTable.get(targetTable)?.has(value)) {
          errors.push(`${table} row ${index + 1} references a missing source ${targetTable} record through ${field}.`);
        }
      }
    });
  }
  if (errors.length) return { valid: false, executed: false, errors, imported: {}, deferred };

  // Preflight all primary keys before the first write. We never overwrite a target row.
  for (const table of IMPORT_ORDER) {
    if (table === "Doctor" || table === "ClinicMember") continue;
    for (const row of (records[table] || []) as Record<string, unknown>[]) {
      const sourceId = typeof row.id === "string" ? row.id : "";
      if (!sourceId) { errors.push(`${table} record is missing id.`); continue; }
      const mappedId = idMap.get(sourceId);
      if (mappedId && mappedId !== sourceId) continue;
      if (await tableHasId(table, sourceId)) errors.push(`${table} id ${sourceId} already exists; import refuses to overwrite it.`);
    }
  }

  if (errors.length) return { valid: false, executed: false, errors, imported: {}, deferred };

  const previewCounts = Object.fromEntries(Object.entries(records).filter(([, rows]) => Array.isArray(rows) && rows.length > 0).map(([table, rows]) => [table, rows.length]));

  if (!options.execute) {
    return {
      valid: true, executed: false, errors: [], imported: {}, previewCounts,
      deferred,
      target: { clinicId: targetClinic.id, clinicName: targetClinic.name },
      message: "Preflight passed. No records were written. Explicit execution is required.",
    };
  }

  try {
    await prisma.$transaction(async tx => {
      // Existing memberships are reused; new memberships retain their source ID only when unused.
      for (const row of (records.ClinicMember || []) as Record<string, unknown>[]) {
        const sourceId = typeof row.id === "string" ? row.id : "";
        const doctorId = typeof row.doctorId === "string" ? idMap.get(row.doctorId) : undefined;
        if (!sourceId || !doctorId) throw new Error(`ClinicMember ${sourceId || "unknown"} references an unresolved doctor.`);
        const existing = await tx.clinicMember.findUnique({ where: { clinicId_doctorId: { clinicId: targetClinicId, doctorId } }, select: { id: true } });
        if (existing) { idMap.set(sourceId, existing.id); continue; }
        const mapped = remapIds({ ...row, clinicId: targetClinicId, doctorId }, idMap, "ClinicMember");
        await insertRowWithClient(tx, "ClinicMember", mapped);
        idMap.set(sourceId, sourceId);
        imported.ClinicMember = (imported.ClinicMember || 0) + 1;
      }

      for (const table of IMPORT_ORDER) {
        if (table === "Doctor" || table === "ClinicMember") continue;
        for (const raw of (records[table] || []) as Record<string, unknown>[]) {
          const sourceId = typeof raw.id === "string" ? raw.id : "";
          const mapped = remapIds(raw, idMap, table);
          if (Object.prototype.hasOwnProperty.call(mapped, "clinicId")) mapped.clinicId = targetClinicId;
          if (table === "MedicalDocument") continue;
          await insertRowWithClient(tx, table, mapped);
          if (sourceId) idMap.set(sourceId, sourceId);
          imported[table] = (imported[table] || 0) + 1;
        }
      }
      // Keep the audit event in the same transaction as the import: the caller must
      // never receive a failed response after data committed without an audit record.
      await tx.auditLog.create({
        data: {
          doctorId: owner.id,
          action: "DATA_IMPORT",
          entity: "Clinic",
          entityId: targetClinicId,
          meta: JSON.stringify({ schemaVersion: MIGRATION_SCHEMA_VERSION, imported, deferred, ownerPreserved: true }),
        },
      });
    }, { maxWait: 10000, timeout: 25000 });
  } catch (error) {
    return {
      valid: false, executed: false,
      errors: [error instanceof Error ? error.message : "Import failed; transaction rolled back."],
      imported: {}, deferred,
    };
  }

  return {
    valid: true, executed: true, errors: [], imported, previewCounts, deferred,
    target: { clinicId: targetClinic.id, clinicName: targetClinic.name },
    ownerPreserved: true,
    message: "Import committed atomically. Existing Master Owner remained the source of truth.",
  };
}

// Same insert primitive as insertRow, but bound to the transaction client so the
// whole migration rolls back on any foreign-key, uniqueness, or type error.
async function insertRowWithClient(client: Prisma.TransactionClient, table: string, row: Record<string, unknown>) {
  const safeRow = { ...row };
  for (const key of ["passwordHash", "encryptedToken", "connectionCodeHash", "tokenHash", "storageKey", "joinTokenHash", "meetingUrl"]) delete safeRow[key];
  const keys = Object.keys(safeRow).filter(k => safeRow[k] !== undefined);
  if (!keys.length) return;
  const cols = keys.map(k => `"${k.replace(/"/g, '""')}"`).join(", ");
  const selects = keys.map(k => `(jsonb_populate_record(NULL::"${table}", $1::jsonb))."${k.replace(/"/g, '""')}"`).join(", ");
  await client.$queryRawUnsafe(
    `INSERT INTO "${table}" (${cols}) SELECT ${selects}`,
    JSON.stringify(safeRow),
  );
}
