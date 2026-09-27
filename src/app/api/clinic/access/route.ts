import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getActiveClinicId, getClinicSetup } from "@/lib/clinic-products";
import { setSelectedClinicId } from "@/lib/clinic-auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const memberships = await prisma.clinicMember.findMany({
    where: { doctorId: session.doctorId, isActive: true, clinic: { isActive: true } },
    select: { clinicId: true, role: true, clinic: { select: { id: true, name: true, isActive: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!memberships.length) return NextResponse.json({ success: false, error: "No active clinic" }, { status: 404 });

  const clinicId = await getActiveClinicId(session.doctorId);
  if (!clinicId) return NextResponse.json({ success: false, error: "No active clinic" }, { status: 404 });

  const setup = await getClinicSetup(clinicId);
  return NextResponse.json({
    success: true,
    clinicId,
    subscriptionModel: setup.subscriptionModel,
    facilityType: setup.facilityType,
    onboardingCompleted: setup.onboardingCompleted,
    facilities: memberships.map((m) => ({
      clinicId: m.clinicId,
      name: m.clinic.name,
      role: m.role,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const clinicId = typeof body.clinicId === "string" ? body.clinicId.trim() : "";
  if (!clinicId) return NextResponse.json({ success: false, error: "Facility is required." }, { status: 400 });

  // The submitted ID is only a selector. It becomes active only when the
  // authenticated doctor has an active membership in that active clinic.
  const membership = await prisma.clinicMember.findFirst({
    where: {
      doctorId: session.doctorId,
      clinicId,
      isActive: true,
      clinic: { isActive: true },
    },
    select: { clinicId: true },
  });
  if (!membership) return NextResponse.json({ success: false, error: "You are not an active member of that facility." }, { status: 403 });

  await setSelectedClinicId(clinicId);
  const setup = await getClinicSetup(clinicId);
  return NextResponse.json({
    success: true,
    clinicId,
    subscriptionModel: setup.subscriptionModel,
    facilityType: setup.facilityType,
    onboardingCompleted: setup.onboardingCompleted,
  }, { headers: { "Cache-Control": "no-store" } });
}
