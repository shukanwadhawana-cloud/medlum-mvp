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
  const owner = await prisma.doctor.findUnique({ where: { id: session.doctorId }, select: { email: true } });
  if (!owner || !isMedlumOwnerEmail(owner.email)) return unauthorized();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [clinics, doctors, patients, appointments, invoices, payments, encounters, monthPayments, pendingInvoices] = await Promise.all([
    prisma.clinic.findMany({ where: { isActive: true }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, createdAt: true, _count: { select: { members: true, patients: true, invoices: true } } } }),
    prisma.doctor.count({ where: { isActive: true } }),
    prisma.patient.findMany({ select: { id: true, clinicId: true, notes: true } }),
    prisma.appointment.count(),
    prisma.invoice.aggregate({ _sum: { total: true, amount: true } }),
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.encounter.count(),
    prisma.payment.aggregate({ where: { paidAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: { status: { not: "Paid" } }, _sum: { total: true, amount: true } }),
  ]);

  const hospitalStats = await Promise.all(clinics.map(async (clinic) => {
    const [collected] = await Promise.all([
      prisma.payment.aggregate({ where: { invoice: { clinicId: clinic.id } }, _sum: { amount: true } }),
    ]);
    const activeIpd = patients.filter((p) => p.clinicId === clinic.id && parseCareSetting(p.notes) === "IPD").length;
    return { id: clinic.id, name: clinic.name, createdAt: clinic.createdAt.toISOString(), doctors: clinic._count.members, patients: clinic._count.patients, invoices: clinic._count.invoices, activeIpd, collectedRevenue: Number(collected._sum.amount || 0) };
  }));

  const totalPatients = patients.length;
  const ipdPatients = patients.filter((p) => parseCareSetting(p.notes) === "IPD").length;
  const grossClinicalBilling = Number(invoices._sum.total ?? invoices._sum.amount ?? 0);
  const collectedClinicalRevenue = Number(payments._sum.amount || 0);
  const outstanding = Number(pendingInvoices._sum.total ?? pendingInvoices._sum.amount ?? Math.max(0, grossClinicalBilling - collectedClinicalRevenue));

  return NextResponse.json({
    success: true,
    generatedAt: now.toISOString(),
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
  }, { headers: { "Cache-Control": "no-store" } });
}
