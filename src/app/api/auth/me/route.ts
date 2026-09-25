import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { normalizeClinicRole } from "@/lib/workflow";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { allocateStaffCode } from "@/lib/staff-id";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ success: false, doctor: null }, { status: 401 });

    const doctor = await prisma.doctor.findUnique({
      where: { id: session.doctorId },
      include: {
        clinicMemberships: {
          where: { isActive: true },
          include: { clinic: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!doctor) return NextResponse.json({ success: false, doctor: null }, { status: 401 });

    const isOwner = isMedlumOwnerEmail(doctor.email);

    for (const m of doctor.clinicMemberships) {
      if (!m.staffCode) {
        try {
          const code = await allocateStaffCode(m.clinicId, m.role);
          await prisma.clinicMember.update({
            where: { id: m.id },
            data: { staffCode: code, designation: m.designation || m.role },
          });
          m.staffCode = code;
        } catch {
          /* ignore concurrent allocate */
        }
      }
    }

    const memberships = doctor.clinicMemberships.map((membership) => ({
      clinicId: membership.clinicId,
      clinicName: membership.clinic.name,
      role: normalizeClinicRole(membership.role),
      staffCode: membership.staffCode || "",
      designation: membership.designation || membership.role,
      department: membership.department || "",
    }));

    const primary = memberships[0];
    const hasWorkforceAdmin = isOwner || memberships.some((m) => ["Owner", "Admin", "Manager"].includes(m.role));

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
        primaryRole: isOwner ? "Owner" : primary?.role || "Consultant",
        hasWorkforceAdmin,
        staffCode: primary?.staffCode || "",
        designation: primary?.designation || "",
        department: primary?.department || "",
        isOwner,
      },
    });
  } catch (e) {
    console.error("me error", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
