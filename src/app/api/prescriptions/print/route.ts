import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";

/** Patient-facing prescription print — clinical content only. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const rx = await prisma.prescription.findFirst({
    where: {
      id,
      patient: { clinicId: membership.clinicId },
    },
    include: {
      patient: {
        select: {
          id: true,
          name: true,
          age: true,
          gender: true,
          phone: true,
          uhid: true,
          registrationNo: true,
        },
      },
      doctor: { select: { id: true, name: true } },
    },
  });
  if (!rx) return NextResponse.json({ error: "Prescription not found" }, { status: 404 });

  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: {
      name: true,
      address: true,
      phone: true,
      email: true,
      registrationNo: true,
      letterheadHeightMm: true,
      showMedlumFooter: true,
    },
  });

  const authorMembership = await prisma.clinicMember.findFirst({
    where: { clinicId: membership.clinicId, doctorId: rx.doctorId },
    select: { staffCode: true, designation: true, role: true },
  });

  return NextResponse.json({
    printable: {
      documentType: "PRESCRIPTION",
      hospital: clinic,
      prescription: {
        id: rx.id,
        patientName: rx.patientName,
        patient: rx.patient,
        medicines: rx.medicines,
        advice: rx.advice,
        encounterId: rx.encounterId,
        createdAt: rx.createdAt.toISOString(),
        author: {
          name: rx.doctor?.name || "",
          staffCode: authorMembership?.staffCode || "",
          designation: authorMembership?.designation || authorMembership?.role || "",
        },
      },
    },
  });
}
