import { prisma } from "@/lib/db";

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
