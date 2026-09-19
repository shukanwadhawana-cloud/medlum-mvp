import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, isMembershipManager } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: {
      id: true,
      name: true,
      address: true,
      phone: true,
      email: true,
      logoUrl: true,
      website: true,
      invoiceFooter: true,
      registrationNo: true,
    },
  });
  if (!clinic) return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
  return NextResponse.json({ branding: clinic });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  if (!isMembershipManager(membership.role)) {
    return NextResponse.json({ error: "Not permitted to update branding" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, string> = {};
  for (const key of ["name", "address", "phone", "email", "logoUrl", "website", "invoiceFooter", "registrationNo"] as const) {
    if (body[key] != null) data[key] = String(body[key]).slice(0, key === "invoiceFooter" ? 1000 : 300);
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ success: false, error: "No branding fields provided" }, { status: 400 });
  }

  const clinic = await prisma.clinic.update({
    where: { id: membership.clinicId },
    data,
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "clinic_branding_update",
    entity: "Clinic",
    entityId: clinic.id,
    meta: { fields: Object.keys(data) },
  });

  return NextResponse.json({
    success: true,
    branding: {
      id: clinic.id,
      name: clinic.name,
      address: clinic.address,
      phone: clinic.phone,
      email: clinic.email,
      logoUrl: clinic.logoUrl,
      website: clinic.website,
      invoiceFooter: clinic.invoiceFooter,
      registrationNo: clinic.registrationNo,
    },
  });
}
