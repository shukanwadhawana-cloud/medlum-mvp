import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createMedlumHelpConversation, isChatwootConfigured } from "@/lib/chatwoot";

const CATEGORIES = [
  "OPD",
  "IPD",
  "Emergency",
  "Pharmacy",
  "Laboratory",
  "Diagnostics",
  "Telemedicine",
  "Workforce / Punch In",
  "Billing",
  "Account / Login",
  "Report a problem",
];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

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

  if (!doctor) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    success: true,
    configured: isChatwootConfigured(),
    categories: CATEGORIES,
    clinics: doctor.clinicMemberships.map((membership) => ({
      clinicId: membership.clinicId,
      clinicName: membership.clinic.name,
      role: membership.role,
      staffCode: membership.staffCode || "",
      designation: membership.designation || membership.role,
      department: membership.department || "",
    })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const clinicId = typeof body.clinicId === "string" ? body.clinicId.trim() : "";
    const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";

    if (!category || !message || !clinicId) {
      return NextResponse.json({ success: false, error: "Category, clinic and message are required." }, { status: 400 });
    }
    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ success: false, error: "Invalid help category." }, { status: 400 });
    }

    const membership = await prisma.clinicMember.findFirst({
      where: { doctorId: session.doctorId, clinicId, isActive: true },
      include: { clinic: true, doctor: true },
    });
    if (!membership) return NextResponse.json({ success: false, error: "You do not have access to this facility." }, { status: 403 });

    let patient: { id: string; uhid: string } | null = null;
    if (patientId) {
      patient = await prisma.patient.findFirst({
        where: { id: patientId, clinicId, deletedAt: null },
        select: { id: true, uhid: true },
      });
      if (!patient) return NextResponse.json({ success: false, error: "Patient is not in the selected facility." }, { status: 400 });
    }

    const result = await createMedlumHelpConversation({
      name: membership.doctor.name,
      email: membership.doctor.email,
      phone: membership.doctor.phone,
      identifier: `medlum-staff:${membership.doctor.id}`,
      message,
      category,
      clinicId,
      clinicName: membership.clinic.name,
      role: membership.role,
      staffCode: membership.staffCode || "",
      patientId: patient?.id,
      patientUhid: patient?.uhid || "",
    });

    return NextResponse.json({ success: true, conversation: result });
  } catch (error) {
    console.error("help conversation error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to create help conversation." },
      { status: 502 }
    );
  }
}
