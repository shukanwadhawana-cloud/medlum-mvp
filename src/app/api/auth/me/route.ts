import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { normalizeClinicRole } from "@/lib/workflow";
import { isMedlumOwnerEmail } from "@/lib/owner";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ success: false, doctor: null }, { status: 401 });

    const doctor = await prisma.doctor.findUnique({
      where: { id: session.doctorId },
      include: { clinicMemberships: { where: { isActive: true }, include: { clinic: true } } },
    });
    if (!doctor) return NextResponse.json({ success: false, doctor: null }, { status: 401 });

    const isOwner = isMedlumOwnerEmail(doctor.email);

    const memberships = doctor.clinicMemberships.map((membership) => ({
      clinicId: membership.clinicId,
      clinicName: membership.clinic.name,
      role: normalizeClinicRole(membership.role),
    }));

    return NextResponse.json({
      success: true,
      isOwner,
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        clinicName: isOwner ? "MedLum Platform" : doctor.clinicName,
        phone: doctor.phone,
        createdAt: doctor.createdAt.toISOString(),
        memberships,
        primaryRole: isOwner ? "Owner" : memberships[0]?.role || "Consultant",
        isOwner,
      },
    });
  } catch (e) {
    console.error("me error", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
