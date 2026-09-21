import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const clampDays = (v: string | null) => Math.min(90, Math.max(7, Number(v || 30) || 30));
const careSetting = (notes: string | null | undefined) =>
  /(?:^|\n)__MEDLUM_CARE_SETTING__:IPD(?:\n|$)/.test(String(notes || "")) ? "IPD" : "OPD";

function countByStatus(rows: { status: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const s = r.status || "Unknown";
    out[s] = (out[s] || 0) + 1;
  }
  return out;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const clinicId = membership.clinicId;
  const url = new URL(req.url);
  const days = clampDays(url.searchParams.get("days"));
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const memberDoctors = await prisma.clinicMember.findMany({
    where: { clinicId, isActive: true },
    select: { doctorId: true, doctor: { select: { id: true, name: true } } },
  });
  const doctorIds = memberDoctors.map((m) => m.doctorId);

  const [
    patients,
    recentPatients,
    encounters,
    recentEncounters,
    appointments,
    recentAppointments,
    invoices,
    recentInvoices,
    payments,
    recentPayments,
    labOrders,
    diagnosticOrders,
    prescriptions,
    dispensings,
    claims,
    pharmacyItems,
    bloodInventory,
    bloodRequests,
    emergencyCases,
  ] = await Promise.all([
    prisma.patient.findMany({
      where: { clinicId, deletedAt: null },
      select: { id: true, status: true, notes: true, createdAt: true },
    }),
    prisma.patient.findMany({
      where: { clinicId, deletedAt: null, createdAt: { gte: start } },
      select: { id: true, createdAt: true },
    }),
    prisma.encounter.count({ where: { patient: { clinicId } } }),
    prisma.encounter.findMany({
      where: { patient: { clinicId }, createdAt: { gte: start } },
      select: { createdAt: true },
    }),
    prisma.appointment.count({ where: { patient: { clinicId } } }),
    prisma.appointment.findMany({
      where: { patient: { clinicId }, createdAt: { gte: start } },
      select: { createdAt: true, status: true },
    }),
    prisma.invoice.findMany({
      where: { patient: { clinicId } },
      select: {
        id: true,
        doctorId: true,
        total: true,
        amount: true,
        status: true,
        createdAt: true,
        patient: { select: { notes: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { patient: { clinicId }, createdAt: { gte: start } },
      select: { createdAt: true, total: true, amount: true },
    }),
    prisma.payment.findMany({
      where: { patient: { clinicId } },
      select: {
        doctorId: true,
        amount: true,
        method: true,
        paidAt: true,
        patient: { select: { notes: true } },
      },
    }),
    prisma.payment.findMany({
      where: { patient: { clinicId }, paidAt: { gte: start } },
      select: { paidAt: true, amount: true },
    }),
    prisma.labOrder.findMany({
      where: { patient: { clinicId } },
      select: { status: true },
    }),
    prisma.diagnosticOrder.findMany({
      where: { patient: { clinicId } },
      select: { status: true },
    }),
    prisma.prescription.count({ where: { patient: { clinicId } } }),
    prisma.dispensing.count({ where: { patient: { clinicId } } }),
    prisma.insuranceClaim.findMany({
      where: { clinicId },
      select: { status: true },
    }),
    doctorIds.length
      ? prisma.pharmacyItem.findMany({
          where: { doctorId: { in: doctorIds } },
          select: { id: true, name: true, quantity: true, reorderLevel: true, expiryDate: true },
        })
      : Promise.resolve([]),
    prisma.bloodInventory.findMany({
      where: { clinicId },
      select: { id: true, unitsAvailable: true, status: true, expiryDate: true, bloodGroup: true, component: true },
    }),
    prisma.bloodRequest.findMany({
      where: { clinicId },
      select: { status: true },
    }),
    prisma.emergencyCase.findMany({
      where: { clinicId },
      select: { status: true, disposition: true },
    }),
  ]);

  const activePatients = patients.filter((p) => p.status !== "DISCHARGED" && p.status !== "ARCHIVED");
  const dischargedPatients = patients.filter((p) => p.status === "DISCHARGED" || p.status === "ARCHIVED");

  const billed = invoices.reduce((s, x) => s + Number(x.total ?? x.amount ?? 0), 0);
  const collected = payments.reduce((s, x) => s + Number(x.amount || 0), 0);
  const outstanding = Math.max(0, billed - collected);
  const recentBilled = recentInvoices.reduce((s, x) => s + Number(x.total ?? x.amount ?? 0), 0);
  const recentCollected = recentPayments.reduce((s, x) => s + Number(x.amount || 0), 0);

  const claimStatuses = countByStatus(claims);
  const claimRequested = claims.filter((c) => /request/i.test(c.status)).length;
  const claimApproved = claims.filter((c) => /approv/i.test(c.status)).length;
  const claimSettled = claims.filter((c) => /settled|paid/i.test(c.status)).length;

  const paymentMethods: Record<string, number> = {};
  payments.forEach((p) => {
    const m = p.method || "Other";
    paymentMethods[m] = (paymentMethods[m] || 0) + Number(p.amount || 0);
  });
  const invoiceStatuses = countByStatus(invoices as { status: string }[]);
  const appointmentStatuses = countByStatus(recentAppointments as { status: string }[]);

  const patientIds = new Set(patients.filter((p) => careSetting(p.notes) === "IPD").map((p) => p.id));
  const settingCounts = { OPD: patients.length - patientIds.size, IPD: patientIds.size };
  const settingRevenue = { OPD: { billed: 0, collected: 0 }, IPD: { billed: 0, collected: 0 } };
  invoices.forEach((x) => {
    const s = careSetting(x.patient.notes) as "OPD" | "IPD";
    settingRevenue[s].billed += Number(x.total ?? x.amount ?? 0);
  });
  payments.forEach((x) => {
    const s = careSetting(x.patient.notes) as "OPD" | "IPD";
    settingRevenue[s].collected += Number(x.amount || 0);
  });

  const trend = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: dayKey(d), patients: 0, encounters: 0, billed: 0, collected: 0 };
  });
  const trendMap = new Map(trend.map((x) => [x.date, x]));
  recentPatients.forEach((x) => {
    const t = trendMap.get(dayKey(x.createdAt));
    if (t) t.patients++;
  });
  recentEncounters.forEach((x) => {
    const t = trendMap.get(dayKey(x.createdAt));
    if (t) t.encounters++;
  });
  recentInvoices.forEach((x) => {
    const t = trendMap.get(dayKey(x.createdAt));
    if (t) t.billed += Number(x.total ?? x.amount ?? 0);
  });
  recentPayments.forEach((x) => {
    const t = trendMap.get(dayKey(x.paidAt));
    if (t) t.collected += Number(x.amount || 0);
  });

  const consultantMap = new Map<
    string,
    { doctorId: string; name: string; invoices: number; billed: number; collected: number }
  >();
  memberDoctors.forEach((m) =>
    consultantMap.set(m.doctor.id, {
      doctorId: m.doctor.id,
      name: m.doctor.name,
      invoices: 0,
      billed: 0,
      collected: 0,
    })
  );
  invoices.forEach((x) => {
    const c = consultantMap.get(x.doctorId);
    if (c) {
      c.invoices++;
      c.billed += Number(x.total ?? x.amount ?? 0);
    }
  });
  payments.forEach((x) => {
    const c = consultantMap.get(x.doctorId);
    if (c) c.collected += Number(x.amount || 0);
  });

  const now = new Date();
  const lowStock = pharmacyItems.filter((i) => i.quantity <= (i.reorderLevel || 0));
  const expiringSoon = pharmacyItems.filter((i) => {
    if (!i.expiryDate) return false;
    const exp = new Date(i.expiryDate);
    if (Number.isNaN(exp.getTime())) return false;
    const daysLeft = (exp.getTime() - now.getTime()) / 86400000;
    return daysLeft >= 0 && daysLeft <= 90;
  });
  const expiredPharmacy = pharmacyItems.filter((i) => {
    if (!i.expiryDate) return false;
    const exp = new Date(i.expiryDate);
    return !Number.isNaN(exp.getTime()) && exp < now;
  });

  const labByStatus = countByStatus(labOrders);
  const labPending = labOrders.filter((o) => !/resulted|cancelled|completed/i.test(o.status)).length;
  const labCompleted = labOrders.filter((o) => /resulted|completed/i.test(o.status)).length;
  const diagnosticsByStatus = countByStatus(diagnosticOrders);
  const diagnosticsPending = diagnosticOrders.filter(
    (o) => !/reported|completed|cancelled/i.test(o.status)
  ).length;
  const diagnosticsCompleted = diagnosticOrders.filter((o) =>
    /reported|completed/i.test(o.status)
  ).length;

  const emergencyByStatus = countByStatus(emergencyCases);
  const emergencyByDisposition: Record<string, number> = {};
  emergencyCases.forEach((c) => {
    const d = c.disposition?.trim() || (c.status === "Open" ? "Open" : "Unspecified");
    emergencyByDisposition[d] = (emergencyByDisposition[d] || 0) + 1;
  });

  const bloodExpiredBatches = bloodInventory.filter((b) => b.expiryDate && b.expiryDate < now);
  const bloodUnitsAvailable = bloodInventory.reduce((s, b) => s + (b.unitsAvailable || 0), 0);

  return NextResponse.json(
    {
      periodDays: days,
      periodStart: start.toISOString(),
      counts: {
        patients: patients.length,
        encounters,
        appointments,
        invoices: invoices.length,
        payments: payments.length,
        labOrders: labOrders.length,
        diagnosticOrders: diagnosticOrders.length,
        prescriptions,
        dispensings,
        claims: claims.length,
      },
      periodCounts: {
        patients: recentPatients.length,
        encounters: recentEncounters.length,
        appointments: recentAppointments.length,
        invoices: recentInvoices.length,
        payments: recentPayments.length,
      },
      careSetting: { counts: settingCounts, revenue: settingRevenue },
      revenue: {
        billed,
        collected,
        outstanding,
        periodBilled: recentBilled,
        periodCollected: recentCollected,
        collectionRate: billed > 0 ? collected / billed : 0,
      },
      insurance: {
        requested: claimRequested,
        approved: claimApproved,
        settled: claimSettled,
        byStatus: claimStatuses,
      },
      paymentMethods,
      invoiceStatuses,
      appointmentStatuses,
      trend,
      consultants: Array.from(consultantMap.values()).sort((a, b) => b.collected - a.collected),
      patients: {
        active: activePatients.length,
        discharged: dischargedPatients.length,
        total: patients.length,
      },
      pharmacy: {
        totalItems: pharmacyItems.length,
        lowStockCount: lowStock.length,
        expiringSoonCount: expiringSoon.length,
        expiredCount: expiredPharmacy.length,
        lowStock: lowStock.slice(0, 50).map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          reorderLevel: i.reorderLevel,
        })),
      },
      laboratory: {
        byStatus: labByStatus,
        pending: labPending,
        completed: labCompleted,
        total: labOrders.length,
      },
      diagnostics: {
        byStatus: diagnosticsByStatus,
        pending: diagnosticsPending,
        completed: diagnosticsCompleted,
        total: diagnosticOrders.length,
      },
      emergency: {
        byStatus: emergencyByStatus,
        byDisposition: emergencyByDisposition,
        total: emergencyCases.length,
        open: emergencyCases.filter((c) => /open|treatment|observation/i.test(c.status)).length,
      },
      bloodBank: {
        unitsAvailable: bloodUnitsAvailable,
        inventoryRows: bloodInventory.length,
        requestsByStatus: countByStatus(bloodRequests),
        expiredBatches: bloodExpiredBatches.length,
        requestTotal: bloodRequests.length,
      },
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
