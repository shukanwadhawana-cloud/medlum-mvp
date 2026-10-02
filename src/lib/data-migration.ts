import { prisma } from "@/lib/db";\nimport type { Prisma } from "@prisma/client";

export const MIGRATION_SCHEMA_VERSION = 1;

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
  { table: "Patient", where: c => ({ sql: `("clinicId" = $1 OR "doctorId" = ANY($2::text[]))`, params: [c.clinicId, c.doctorIds] }) },
  { table: "Appointment", where: c => ({ sql: `("doctorId" = ANY($1::text[]) OR "patientId" = ANY($2::text[]))`, params: [c.doctorIds, c.patientIds] }) },
  { table: "Encounter", where: c => ({ sql: `("doctorId" = ANY($1::text[]) OR "patientId" = ANY($2::text[]))`, params: [c.doctorIds, c.patientIds] }) },
  { table: "Prescription", where: c => ({ sql: `("doctorId" = ANY($1::text[]) OR "patientId" = ANY($2::text[]))`, params: [c.doctorIds, c.patientIds] }) },
  { table: "Invoice", where: c => ({ sql: `("clinicId" = $1 OR "doctorId" = ANY($2::text[]) OR "patientId" = ANY($3::text[]))`, params: [c.clinicId, c.doctorIds, c.patientIds] }) },
  { table: "InvoiceItem", where: c => anyOf("invoiceId", c.invoiceIds) },
  { table: "Payment", where: c => ({ sql: `("doctorId" = ANY($1::text[]) OR "patientId" = ANY($2::text[]) OR "invoiceId" = ANY($3::text[]))`, params: [c.doctorIds, c.patientIds, c.invoiceIds] }) },
  { table: "LabOrder", where: c => ({ sql: `("doctorId" = ANY($1::text[]) OR "patientId" = ANY($2::text[]))`, params: [c.doctorIds, c.patientIds] }) },
  { table: "PharmacyItem", where: c => anyOf("doctorId", c.doctorIds) },
  { table: "Dispensing", where: c => ({ sql: `("doctorId" = ANY($1::text[]) OR "patientId" = ANY($2::text[]) OR "prescriptionId" = ANY($3::text[]))`, params: [c.doctorIds, c.patientIds, c.prescriptionIds] }) },
  { table: "MedicationAdministration", where: c => ({ sql: `("clinicId" = $1 OR "patientId" = ANY($2::text[]) OR "prescriptionId" = ANY($3::text[]) OR "encounterId" = ANY($4::text[]) OR "administeringMemberId" = ANY($5::text[]))`, params: [c.clinicId, c.patientIds, c.prescriptionIds, c.encounterIds, c.memberIds] }) },
  { table: "DiagnosticOrder", where: c => ({ sql: `("doctorId" = ANY($1::text[]) OR "patientId" = ANY($2::text[]))`, params: [c.doctorIds, c.patientIds] }) },
  { table: "BloodInventory", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "BloodDonor", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "BloodRequest", where: c => ({ sql: `("clinicId" = $1 OR "patientId" = ANY($2::text[]) OR "doctorId" = ANY($3::text[]) OR "inventoryId" = ANY($4::text[]))`, params: [c.clinicId, c.patientIds, c.doctorIds, c.bloodInventoryIds] }) },
  { table: "InsuranceProvider", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "InsurancePolicy", where: c => ({ sql: `("clinicId" = $1 OR "patientId" = ANY($2::text[]) OR "providerId" = ANY($3::text[]))`, params: [c.clinicId, c.patientIds, c.insuranceProviderIds] }) },
  { table: "InsuranceClaim", where: c => ({ sql: `("clinicId" = $1 OR "patientId" = ANY($2::text[]) OR "policyId" = ANY($3::text[]) OR "invoiceId" = ANY($4::text[]))`, params: [c.clinicId, c.patientIds, c.insurancePolicyIds, c.invoiceIds] }) },
  { table: "WorkforceRecord", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "ClinicalNote", where: c => ({ sql: `("clinicId" = $1 OR "patientId" = ANY($2::text[]) OR "authorDoctorId" = ANY($3::text[]) OR "verifierDoctorId" = ANY($3::text[]) OR "encounterId" = ANY($4::text[]))`, params: [c.clinicId, c.patientIds, c.doctorIds, c.encounterIds] }) },
  { table: "AuditLog", where: c => anyOf("doctorId", c.doctorIds) },
  { table: "TelemedicineSession", where: c => ({ sql: `("clinicId" = $1 OR "doctorId" = ANY($2::text[]) OR "patientId" = ANY($3::text[]) OR "appointmentId" = ANY($4::text[]))`, params: [c.clinicId, c.doctorIds, c.patientIds, c.appointmentIds] }) },
  { table: "TelemedicineParticipant", where: c => anyOf("sessionId", c.sessionIds), sensitive: ["tokenHash"] },
  { table: "PatientPortalAccount", where: c => ({ sql: `("clinicId" = $1 OR "patientId" = ANY($2::text[]))`, params: [c.clinicId, c.patientIds] }), sensitive: ["passwordHash"] },
  { table: "FacilityTelegramIntegration", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }), sensitive: ["encryptedToken", "connectionCodeHash"] },
  { table: "TelegramIdentity", where: c => anyOf("doctorId", c.doctorIds) },
  { table: "TariffVersion", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "TariffItem", where: c => anyOf("tariffVersionId", c.tariffVersionIds) },
  { table: "LabTemplate", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "LabTemplateParameter", where: c => anyOf("templateId", c.labTemplateIds) },
  { table: "AbdmConsent", where: c => ({ sql: `("clinicId" = $1 OR "patientId" = ANY($2::text[]))`, params: [c.clinicId, c.patientIds] }) },
  { table: "AbdmCareContext", where: c => ({ sql: `("clinicId" = $1 OR "patientId" = ANY($2::text[]))`, params: [c.clinicId, c.patientIds] }) },
  { table: "AbdmEvent", where: c => ({ sql: `"clinicId" = $1`, params: [c.clinicId] }) },
  { table: "EmergencyCase", where: c => ({ sql: `("clinicId" = $1 OR "patientId" = ANY($2::text[]) OR "doctorId" = ANY($3::text[]))`, params: [c.clinicId, c.patientIds, c.doctorIds] }) },
  { table: "MedicalDocument", where: c => ({ sql: `("clinicId" = $1 OR "patientId" = ANY($2::text[]))`, params: [c.clinicId, c.patientIds] }), sensitive: ["storageKey"] },
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
  const patientRows = await prisma.patient.findMany({ where: { OR: [{ clinicId }, { doctorId: { in: doctorIds } }] } });
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
  records.Doctor = (records.Doctor || []).map(r => withoutSensitive(r as Record<string, unknown>, ["passwordHash"]));

  return {
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    source: { clinicId, clinicName: clinic.name, ownerEmail },
    protection: { ownerEmail, note: "The current MedLum Master Owner is never replaced by imported records." },
    records,
  };
}

export function validateMigrationPackage(pkg: unknown) {
  if (!pkg || typeof pkg !== "object") throw new Error("Import package must be a JSON object");
  const p = pkg as Record<string, unknown>;
  if (p.schemaVersion !== MIGRATION_SCHEMA_VERSION) throw new Error("Unsupported migration package version");
  if (!p.records || typeof p.records !== "object") throw new Error("Migration package has no records");
  const records = p.records as Record<string, unknown>;
  const allowed = new Set(specs.map(s => s.table));
  const errors: string[] = [];
  for (const [table, rows] of Object.entries(records)) {
    if (!allowed.has(table)) errors.push(`Unsupported table: ${table}`);
    if (!Array.isArray(rows)) errors.push(`Records for ${table} must be an array`);
    if (Array.isArray(rows) && rows.length > 20000) errors.push(`${table} exceeds the per-table import limit (20,000)`);
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
  "DutyAttendanceRequest", "TelemedicineSession", "ClinicalNote", "AuditLog",
];

const DEFERRED_IMPORT_TABLES = new Set([
  "MedicalDocument", "PatientPortalAccount", "FacilityTelegramIntegration",
  "TelegramIdentity", "TelegramLinkChallenge", "TelemedicineParticipant",
]);

const ID_KEYS = new Set([
  "id", "clinicId", "doctorId", "patientId", "appointmentId", "encounterId",
  "prescriptionId", "invoiceId", "labOrderId", "diagnosticOrderId", "inventoryId",
  "providerId", "policyId", "memberId", "administeringMemberId", "tariffVersionId",
  "tariffItemId", "templateId", "sessionId", "claimId", "documentId",
]);

function remapIds(row: Record<string, unknown>, idMap: Map<string, string>) {
  const out = { ...row };
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (typeof value === "string" && idMap.has(value) && (ID_KEYS.has(key) || key.endsWith("Id"))) {
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
  for (const key of ["passwordHash", "encryptedToken", "connectionCodeHash", "tokenHash", "storageKey"]) {
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

  if (!options.execute) {
    return {
      valid: true, executed: false, errors: [], imported: {},
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
        const mapped = remapIds({ ...row, clinicId: targetClinicId, doctorId }, idMap);
        await insertRowWithClient(tx, "ClinicMember", mapped);
        idMap.set(sourceId, sourceId);
        imported.ClinicMember = (imported.ClinicMember || 0) + 1;
      }

      for (const table of IMPORT_ORDER) {
        if (table === "Doctor" || table === "ClinicMember") continue;
        for (const raw of (records[table] || []) as Record<string, unknown>[]) {
          const sourceId = typeof raw.id === "string" ? raw.id : "";
          const mapped = remapIds(raw, idMap);
          if (Object.prototype.hasOwnProperty.call(mapped, "clinicId")) mapped.clinicId = targetClinicId;
          if (table === "MedicalDocument") continue;
          await insertRowWithClient(tx, table, mapped);
          if (sourceId) idMap.set(sourceId, sourceId);
          imported[table] = (imported[table] || 0) + 1;
        }
      }
    }, { maxWait: 10000, timeout: 25000 });
  } catch (error) {
    return {
      valid: false, executed: false,
      errors: [error instanceof Error ? error.message : "Import failed; transaction rolled back."],
      imported: {}, deferred,
    };
  }

  return {
    valid: true, executed: true, errors: [], imported, deferred,
    target: { clinicId: targetClinic.id, clinicName: targetClinic.name },
    ownerPreserved: true,
    message: "Import committed atomically. Existing Master Owner remained the source of truth.",
  };
}

// Same insert primitive as insertRow, but bound to the transaction client so the
// whole migration rolls back on any foreign-key, uniqueness, or type error.
async function insertRowWithClient(client: Prisma.TransactionClient, table: string, row: Record<string, unknown>) {
  const safeRow = { ...row };
  for (const key of ["passwordHash", "encryptedToken", "connectionCodeHash", "tokenHash", "storageKey"]) delete safeRow[key];
  const keys = Object.keys(safeRow).filter(k => safeRow[k] !== undefined);
  if (!keys.length) return;
  const cols = keys.map(k => `"${k.replace(/"/g, '""')}"`).join(", ");
  const selects = keys.map(k => `(jsonb_populate_record(NULL::"${table}", $1::jsonb))."${k.replace(/"/g, '""')}"`).join(", ");
  await client.$queryRawUnsafe(
    `INSERT INTO "${table}" (${cols}) SELECT ${selects}`,
    JSON.stringify(safeRow),
  );
}
