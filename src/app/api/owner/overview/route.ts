import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { parseCareSetting } from "@/lib/patient-metadata";

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
  const [clinics, doctors, patients, appointments, invoices, payments, encounters, monthPayments, pendingInvoices] = await Promise.all([
    prisma.clinic.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true, _count: { select: { members: true, patients: true, invoices: true } } },
    }),
    prisma.doctor.count({ where: { isActive: true } }),
    prisma.patient.findMany({ select: { id: true, doctorId: true, clinicId: true, notes: true } }),
    prisma.appointment.count(),
    prisma.invoice.aggregate({ _sum: { total: true, amount: true } }),
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.encounter.count(),
    prisma.payment.aggregate({ where: { paidAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: { status: { not: "Paid" } }, _sum: { total: true, amount: true } }),
  ]);

  const hospitalStats = await Promise.all(
    clinics.map(async (clinic) => {
      const collected = await prisma.payment.aggregate({ where: { invoice: { clinicId: clinic.id } }, _sum: { amount: true } });
      const activeIpd = patients.filter((p) => p.clinicId === clinic.id && parseCareSetting(p.notes) === "IPD").length;
      return {
        id: clinic.id,
        name: clinic.name,
        createdAt: clinic.createdAt.toISOString(),
        doctors: clinic._count.members,
        patients: clinic._count.patients,
        invoices: clinic._count.invoices,
        activeIpd,
        collectedRevenue: Number(collected._sum.amount || 0),
      };
    }),
  );

  // Preserve the founder's existing clinic/workspace even when older records pre-date
  // Clinic/ClinicMember linking. Nothing here mutates or deletes clinical data.
  const myClinics = owner.clinicMemberships.map((m) => ({
    id: m.clinic.id,
    name: m.clinic.name,
    role: m.role,
    isActive: m.clinic.isActive,
  }));
  const legacyOwnedPatients = patients.filter((p) => !p.clinicId && p.doctorId === session.doctorId).length;
  const legacyClinicName = owner.clinicName?.trim() || "";
  const existingWorkspace = myClinics[0]
    ? { id: myClinics[0].id, name: myClinics[0].name, role: myClinics[0].role, legacy: false, legacyOwnedPatients: 0 }
    : legacyClinicName
      ? { id: null, name: legacyClinicName, role: "Owner", legacy: true, legacyOwnedPatients }
      : null;

  const totalPatients = patients.length;
  const ipdPatients = patients.filter((p) => parseCareSetting(p.notes) === "IPD").length;
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
        activeHospitals: clinics.length,
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
