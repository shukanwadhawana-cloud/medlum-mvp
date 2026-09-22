import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";

/** Patient-facing lab report — investigation content only, no billing. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const order = await prisma.labOrder.findFirst({
    where: { id, patient: { clinicId: membership.clinicId } },
    include: {
      patient: {
        select: {
          id: true,
          name: true,
          age: true,
          gender: true,
          uhid: true,
          registrationNo: true,
        },
      },
      doctor: { select: { id: true, name: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Lab order not found" }, { status: 404 });

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
    where: { clinicId: membership.clinicId, doctorId: order.doctorId },
    select: { staffCode: true, designation: true, role: true },
  });

  return NextResponse.json({
    printable: {
      documentType: "LAB_REPORT",
      hospital: clinic,
      report: {
        id: order.id,
        testName: order.testName,
        category: order.category,
        status: order.status,
        result: order.result,
        notes: order.notes,
        orderedAt: order.orderedAt.toISOString(),
        resultedAt: order.resultedAt?.toISOString() || null,
        encounterId: order.encounterId,
        patientName: order.patientName,
        patient: order.patient,
        author: {
          name: order.doctor?.name || "",
          staffCode: authorMembership?.staffCode || "",
          designation: authorMembership?.designation || authorMembership?.role || "",
        },
      },
    },
  });
}
