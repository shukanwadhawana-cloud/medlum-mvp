import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, canManageLab } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";

/** System CBC template parameters (standard hematology panel). */
const CBC_PARAMETERS = [
  { name: "Hemoglobin", unit: "g/dL", referenceRange: "13.0-17.0 (M) / 12.0-15.0 (F)", decimalPlaces: 1, displayOrder: 1, criticalLow: 7, criticalHigh: 20 },
  { name: "RBC", unit: "10^6/µL", referenceRange: "4.5-5.5 (M) / 3.8-4.8 (F)", decimalPlaces: 2, displayOrder: 2, criticalLow: 2.5, criticalHigh: 7 },
  { name: "WBC", unit: "10^3/µL", referenceRange: "4.0-11.0", decimalPlaces: 1, displayOrder: 3, criticalLow: 2, criticalHigh: 30 },
  { name: "Platelets", unit: "10^3/µL", referenceRange: "150-450", decimalPlaces: 0, displayOrder: 4, criticalLow: 50, criticalHigh: 1000 },
  { name: "Hematocrit", unit: "%", referenceRange: "40-50 (M) / 36-46 (F)", decimalPlaces: 1, displayOrder: 5, criticalLow: 20, criticalHigh: 60 },
  { name: "MCV", unit: "fL", referenceRange: "83-101", decimalPlaces: 1, displayOrder: 6 },
  { name: "MCH", unit: "pg", referenceRange: "27-32", decimalPlaces: 1, displayOrder: 7 },
  { name: "MCHC", unit: "g/dL", referenceRange: "31.5-34.5", decimalPlaces: 1, displayOrder: 8 },
  { name: "RDW", unit: "%", referenceRange: "11.5-14.5", decimalPlaces: 1, displayOrder: 9 },
  { name: "Neutrophils", unit: "%", referenceRange: "40-75", decimalPlaces: 0, displayOrder: 10 },
  { name: "Lymphocytes", unit: "%", referenceRange: "20-40", decimalPlaces: 0, displayOrder: 11 },
  { name: "Monocytes", unit: "%", referenceRange: "2-10", decimalPlaces: 0, displayOrder: 12 },
  { name: "Eosinophils", unit: "%", referenceRange: "1-6", decimalPlaces: 0, displayOrder: 13 },
  { name: "Basophils", unit: "%", referenceRange: "0-1", decimalPlaces: 0, displayOrder: 14 },
];

async function ensureSystemCbcTemplate() {
  const existing = await prisma.labTemplate.findFirst({
    where: { isSystem: true, code: "CBC" },
    include: { parameters: { orderBy: { displayOrder: "asc" } } },
  });
  if (existing) return existing;

  return prisma.labTemplate.create({
    data: {
      clinicId: null,
      code: "CBC",
      name: "Complete Blood Count (CBC)",
      category: "Hematology",
      description: "Standard complete blood count with differential",
      isSystem: true,
      isActive: true,
      parameters: {
        create: CBC_PARAMETERS.map((p) => ({
          name: p.name,
          unit: p.unit,
          referenceRange: p.referenceRange,
          resultType: "numeric",
          decimalPlaces: p.decimalPlaces,
          displayOrder: p.displayOrder,
          criticalLow: p.criticalLow ?? null,
          criticalHigh: p.criticalHigh ?? null,
        })),
      },
    },
    include: { parameters: { orderBy: { displayOrder: "asc" } } },
  });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  await ensureSystemCbcTemplate();

  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (code) {
    const template = await prisma.labTemplate.findFirst({
      where: {
        code,
        isActive: true,
        OR: [{ isSystem: true }, { clinicId: membership.clinicId }],
      },
      include: { parameters: { orderBy: { displayOrder: "asc" } } },
    });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    return NextResponse.json({ template });
  }

  const templates = await prisma.labTemplate.findMany({
    where: {
      isActive: true,
      OR: [{ isSystem: true }, { clinicId: membership.clinicId }],
    },
    include: { parameters: { orderBy: { displayOrder: "asc" } } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  if (!canManageLab(membership.role)) {
    return NextResponse.json({ error: "Not permitted to manage lab templates" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  const name = String(body.name || "").trim();
  const category = String(body.category || "General").trim();
  const description = String(body.description || "").trim();
  const parameters = Array.isArray(body.parameters) ? body.parameters : [];

  if (!code || !name) {
    return NextResponse.json({ success: false, error: "code and name required" }, { status: 400 });
  }

  const existing = await prisma.labTemplate.findFirst({
    where: { clinicId: membership.clinicId, code },
  });
  if (existing) {
    return NextResponse.json({ success: false, error: "Template code already exists for this clinic" }, { status: 409 });
  }

  const template = await prisma.labTemplate.create({
    data: {
      clinicId: membership.clinicId,
      code,
      name,
      category,
      description,
      isSystem: false,
      isActive: true,
      parameters: {
        create: parameters.map((p: any, i: number) => ({
          name: String(p.name || "").trim() || `Param ${i + 1}`,
          unit: String(p.unit || ""),
          referenceRange: String(p.referenceRange || ""),
          resultType: String(p.resultType || "numeric"),
          decimalPlaces: Number(p.decimalPlaces) || 1,
          displayOrder: Number(p.displayOrder) || i,
          criticalLow: p.criticalLow != null ? Number(p.criticalLow) : null,
          criticalHigh: p.criticalHigh != null ? Number(p.criticalHigh) : null,
          formula: String(p.formula || ""),
        })),
      },
    },
    include: { parameters: { orderBy: { displayOrder: "asc" } } },
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "create",
    entity: "LabTemplate",
    entityId: template.id,
    meta: { code, name, clinicId: membership.clinicId },
  });

  return NextResponse.json({ success: true, template });
}
