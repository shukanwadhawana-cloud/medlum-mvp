import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { normalizeClinicRole } from "@/lib/workflow";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ success: false, doctor: null }, { status: 401 });

    const doctor = await prisma.doctor.findUnique({
      where: { id: session.doctorId },
      include: { clinicMemberships: { where: { isActive: true }, include: { clinic: true } } },
    });
    if (!doctor) return NextResponse.json({ success: false, doctor: null }, { status: 401 });

    const memberships = doctor.clinicMemberships.map((membership) => ({
      clinicId: membership.clinicId,
      clinicName: membership.clinic.name,
      role: normalizeClinicRole(membership.role),
    }));

    return NextResponse.json({
      success: true,
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        clinicName: doctor.clinicName,
        phone: doctor.phone,
        createdAt: doctor.createdAt.toISOString(),
        memberships,
        primaryRole: memberships[0]?.role || "Consultant",
      },
    });
  } catch (e) {
    console.error("me error", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
