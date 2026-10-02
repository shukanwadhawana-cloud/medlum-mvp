import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { Prisma } from "@prisma/client";

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const owner = await prisma.doctor.findUnique({
    where: { id: session.doctorId },
    select: {
      email: true,
      clinicName: true,
      clinicMemberships: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { clinicId: true, role: true, clinic: { select: { id: true, name: true, isActive: true } } },
      },
    },
  });
  if (!owner || !isMedlumOwnerEmail(owner.email)) return unauthorized();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [clinics, doctors, totalPatients, ipdPatients, appointments, invoices, payments, encounters, monthPayments, pendingInvoices, ipdByClinic, legacyOwnedPatients, collectedByClinic] = await Promise.all([
    prisma.clinic.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true, isActive: true, facilityStatus: true, statusReason: true, _count: { select: { members: true, patients: true, invoices: true } } },
    }),
    prisma.doctor.count({ where: { isActive: true } }),
    prisma.patient.count(),
    prisma.patient.count({ where: { notes: { contains: "__MEDLUM_CARE_SETTING__:IPD" } } }),
    prisma.appointment.count(),
    prisma.invoice.aggregate({ _sum: { total: true, amount: true } }),
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.encounter.count(),
    prisma.payment.aggregate({ where: { paidAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: { status: { not: "Paid" } }, _sum: { total: true, amount: true } }),
    prisma.patient.groupBy({ by: ["clinicId"], where: { notes: { contains: "__MEDLUM_CARE_SETTING__:IPD" } }, _count: { _all: true } }),
    prisma.patient.count({ where: { clinicId: null, doctorId: session.doctorId } }),
    prisma.$queryRaw<Array<{ clinicId: string | null; collected: Prisma.Decimal | null }>>(Prisma.sql`SELECT i."clinicId" AS "clinicId", COALESCE(SUM(p."amount"), 0) AS "collected" FROM "Invoice" i LEFT JOIN "Payment" p ON p."invoiceId" = i."id" GROUP BY i."clinicId"`),
  ]);

  const ipdByClinicMap = new Map(ipdByClinic.map((row) => [row.clinicId || "", row._count._all]));
  const collectedByClinicMap = new Map(collectedByClinic.map((row) => [row.clinicId || "", Number(row.collected || 0)]));
  const hospitalStats = clinics.map((clinic) => ({
    id: clinic.id,
    name: clinic.name,
    createdAt: clinic.createdAt.toISOString(),
    doctors: clinic._count.members,
    patients: clinic._count.patients,
    invoices: clinic._count.invoices,
    activeIpd: ipdByClinicMap.get(clinic.id) || 0,
    isActive: clinic.isActive,
    facilityStatus: clinic.facilityStatus,
    statusReason: clinic.statusReason,
    collectedRevenue: collectedByClinicMap.get(clinic.id) || 0,
  }));

  // Preserve the founder's existing clinic/workspace even when older records pre-date
  // Clinic/ClinicMember linking. Nothing here mutates or deletes clinical data.
  const myClinics = owner.clinicMemberships.map((m) => ({
    id: m.clinic.id,
    name: m.clinic.name,
    role: m.role,
    isActive: m.clinic.isActive,
  }));
    const legacyClinicName = owner.clinicName?.trim() || "";
  const existingWorkspace = myClinics[0]
    ? { id: myClinics[0].id, name: myClinics[0].name, role: myClinics[0].role, legacy: false, legacyOwnedPatients: 0 }
    : legacyClinicName
      ? { id: null, name: legacyClinicName, role: "Owner", legacy: true, legacyOwnedPatients }
      : null;

    const grossClinicalBilling = Number(invoices._sum.total ?? invoices._sum.amount ?? 0);
  const collectedClinicalRevenue = Number(payments._sum.amount || 0);
  const outstanding = Number(pendingInvoices._sum.total ?? pendingInvoices._sum.amount ?? Math.max(0, grossClinicalBilling - collectedClinicalRevenue));

  return NextResponse.json(
    {
      success: true,
      generatedAt: now.toISOString(),
      ownerWorkspace: {
        existingWorkspace,
        myClinics,
        clinicalWorkspacePath: "/dashboard",
        dataPreserved: true,
      },
      platform: {
        activeHospitals: clinics.filter((c) => c.isActive).length,
        activeDoctors: doctors,
        totalPatients,
        opdPatients: totalPatients - ipdPatients,
        ipdPatients,
        appointments,
        encounters,
        grossClinicalBilling,
        collectedClinicalRevenue,
        outstandingClinicalBilling: outstanding,
        collectedThisMonth: Number(monthPayments._sum.amount || 0),
        platformRevenue: null,
      },
      hospitals: hospitalStats,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
