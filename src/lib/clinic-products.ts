import { prisma } from "@/lib/db";

export type ClinicalModule = "OPD" | "IPD";
export type SubscriptionModel = "OPD" | "IPD" | "BOTH";

export type ClinicSetup = {
  clinicId: string;
  facilityType: "HOSPITAL" | "CLINIC";
  subscriptionModel: SubscriptionModel;
  licenseNumber: string;
  registrationNumber: string;
  ownerName: string;
  doctorInCharge: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  onboardingCompleted: boolean;
};

let tableReady: Promise<void> | null = null;

/**
 * Product entitlements live outside the original clinical schema so this rollout
 * remains backward-compatible with existing MedLum data. Existing clinics default
 * to BOTH, preserving their current OPD + IPD behaviour until an owner changes it.
 */
export function ensureClinicProductTable() {
  if (!tableReady) {
    tableReady = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MedLumClinicSetup" (
        "clinicId" TEXT PRIMARY KEY REFERENCES "Clinic"("id") ON DELETE CASCADE,
        "facilityType" TEXT NOT NULL DEFAULT 'CLINIC',
        "subscriptionModel" TEXT NOT NULL DEFAULT 'BOTH',
        "licenseNumber" TEXT NOT NULL DEFAULT '',
        "registrationNumber" TEXT NOT NULL DEFAULT '',
        "ownerName" TEXT NOT NULL DEFAULT '',
        "doctorInCharge" TEXT NOT NULL DEFAULT '',
        "address" TEXT NOT NULL DEFAULT '',
        "city" TEXT NOT NULL DEFAULT '',
        "state" TEXT NOT NULL DEFAULT '',
        "pincode" TEXT NOT NULL DEFAULT '',
        "phone" TEXT NOT NULL DEFAULT '',
        "email" TEXT NOT NULL DEFAULT '',
        "onboardingCompleted" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).then(() => undefined).catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

const normaliseModel = (value: unknown): SubscriptionModel => value === "OPD" || value === "IPD" || value === "BOTH" ? value : "BOTH";
const normaliseFacility = (value: unknown): "HOSPITAL" | "CLINIC" => value === "HOSPITAL" ? "HOSPITAL" : "CLINIC";

export async function getClinicSetup(clinicId: string): Promise<ClinicSetup> {
  await ensureClinicProductTable();
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "MedLumClinicSetup" WHERE "clinicId" = $1 LIMIT 1`, clinicId);
  if (rows[0]) return rows[0] as ClinicSetup;

  await prisma.$executeRawUnsafe(`INSERT INTO "MedLumClinicSetup" ("clinicId") VALUES ($1) ON CONFLICT ("clinicId") DO NOTHING`, clinicId);
  const created = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "MedLumClinicSetup" WHERE "clinicId" = $1 LIMIT 1`, clinicId);
  return created[0] as ClinicSetup;
}

export async function saveClinicSetup(clinicId: string, input: Partial<ClinicSetup>) {
  await ensureClinicProductTable();
  const current = await getClinicSetup(clinicId);
  const facilityType = normaliseFacility(input.facilityType ?? current.facilityType);
  const subscriptionModel = normaliseModel(input.subscriptionModel ?? current.subscriptionModel);
  const values = {
    facilityType,
    subscriptionModel,
    licenseNumber: String(input.licenseNumber ?? current.licenseNumber ?? "").trim(),
    registrationNumber: String(input.registrationNumber ?? current.registrationNumber ?? "").trim(),
    ownerName: String(input.ownerName ?? current.ownerName ?? "").trim(),
    doctorInCharge: String(input.doctorInCharge ?? current.doctorInCharge ?? "").trim(),
    address: String(input.address ?? current.address ?? "").trim(),
    city: String(input.city ?? current.city ?? "").trim(),
    state: String(input.state ?? current.state ?? "").trim(),
    pincode: String(input.pincode ?? current.pincode ?? "").trim(),
    phone: String(input.phone ?? current.phone ?? "").trim(),
    email: String(input.email ?? current.email ?? "").trim().toLowerCase(),
    onboardingCompleted: Boolean(input.onboardingCompleted ?? current.onboardingCompleted),
  };
  await prisma.$executeRawUnsafe(`
    UPDATE "MedLumClinicSetup" SET
      "facilityType"=$2,"subscriptionModel"=$3,"licenseNumber"=$4,"registrationNumber"=$5,
      "ownerName"=$6,"doctorInCharge"=$7,"address"=$8,"city"=$9,"state"=$10,"pincode"=$11,
      "phone"=$12,"email"=$13,"onboardingCompleted"=$14,"updatedAt"=CURRENT_TIMESTAMP
    WHERE "clinicId"=$1
  `, clinicId, values.facilityType, values.subscriptionModel, values.licenseNumber, values.registrationNumber,
    values.ownerName, values.doctorInCharge, values.address, values.city, values.state, values.pincode,
    values.phone, values.email, values.onboardingCompleted);
  return getClinicSetup(clinicId);
}

export async function clinicHasModule(clinicId: string, module: ClinicalModule) {
  const setup = await getClinicSetup(clinicId);
  return setup.subscriptionModel === "BOTH" || setup.subscriptionModel === module;
}

export async function getActiveClinicId(doctorId: string) {
  const membership = await prisma.clinicMember.findFirst({
    where: { doctorId, isActive: true, clinic: { isActive: true } },
    select: { clinicId: true },
    orderBy: { createdAt: "asc" },
  });
  return membership?.clinicId || null;
}

export async function requireClinicalModule(doctorId: string, module: ClinicalModule) {
  const clinicId = await getActiveClinicId(doctorId);
  if (!clinicId) return { allowed: false as const, clinicId: null };
  const allowed = await clinicHasModule(clinicId, module);
  return { allowed, clinicId };
}
