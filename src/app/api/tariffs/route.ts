import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, canManageTariff } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const url = new URL(req.url);
  const versionId = url.searchParams.get("versionId");
  const activeOnly = url.searchParams.get("active") === "1";

  if (versionId) {
    const version = await prisma.tariffVersion.findFirst({
      where: { id: versionId, clinicId: membership.clinicId },
      include: { items: { orderBy: { name: "asc" }, take: 500 } },
    });
    if (!version) return NextResponse.json({ error: "Tariff version not found" }, { status: 404 });
    return NextResponse.json({ version });
  }

  const versions = await prisma.tariffVersion.findMany({
    where: {
      clinicId: membership.clinicId,
      ...(activeOnly ? { isActive: true } : {}),
    },
    orderBy: [{ isActive: "desc" }, { effectiveFrom: "desc" }],
    include: { _count: { select: { items: true } } },
  });
  return NextResponse.json({ versions });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  if (!canManageTariff(membership.role)) {
    return NextResponse.json({ error: "Not permitted to manage tariffs" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "Tariff").trim().slice(0, 120) || "Tariff";
  const version = String(body.version || new Date().toISOString().slice(0, 10)).trim().slice(0, 40);
  const notes = String(body.notes || "").slice(0, 500);
  const sourceFile = String(body.sourceFile || "").slice(0, 200);

  const created = await prisma.tariffVersion.create({
    data: {
      clinicId: membership.clinicId,
      name,
      version,
      notes,
      sourceFile,
      isActive: false,
      createdBy: session.doctorId,
    },
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "tariff_version_create",
    entity: "TariffVersion",
    entityId: created.id,
    meta: { name, version, clinicId: membership.clinicId },
  });

  return NextResponse.json({ success: true, version: created });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  if (!canManageTariff(membership.role)) {
    return NextResponse.json({ error: "Not permitted to manage tariffs" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const action = String(body.action || "");
  if (!id || action !== "activate") {
    return NextResponse.json({ success: false, error: "id and action=activate required" }, { status: 400 });
  }

  const version = await prisma.tariffVersion.findFirst({
    where: { id, clinicId: membership.clinicId },
    include: { _count: { select: { items: true } } },
  });
  if (!version) return NextResponse.json({ success: false, error: "Version not found" }, { status: 404 });
  if (version._count.items === 0) {
    return NextResponse.json({ success: false, error: "Cannot activate empty tariff version" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.tariffVersion.updateMany({
      where: { clinicId: membership.clinicId, isActive: true },
      data: { isActive: false, effectiveTo: new Date() },
    }),
    prisma.tariffVersion.update({
      where: { id },
      data: { isActive: true, effectiveFrom: new Date(), effectiveTo: null },
    }),
  ]);

  await writeAudit({
    doctorId: session.doctorId,
    action: "tariff_version_activate",
    entity: "TariffVersion",
    entityId: id,
    meta: { clinicId: membership.clinicId, name: version.name, version: version.version },
  });

  const updated = await prisma.tariffVersion.findUnique({ where: { id } });
  return NextResponse.json({ success: true, version: updated });
}
