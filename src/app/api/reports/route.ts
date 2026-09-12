import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const clampDays = (v: string | null) => Math.min(90, Math.max(7, Number(v || 30) || 30));
const careSetting = (notes: string | null | undefined) => /(?:^|\n)__MEDLUM_CARE_SETTING__:IPD(?:\n|$)/.test(String(notes || "")) ? "IPD" : "OPD";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.clinicMember.findFirst({ where: { doctorId: session.doctorId }, orderBy: { createdAt: "asc" } });
  if (!membership) return NextResponse.json({ error: "Clinic membership required" }, { status: 403 });
  const clinicId = membership.clinicId;
  const days = clampDays(new URL(req.url).searchParams.get("days"));
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));

  const [patients, encounters, appointments, invoices, payments, labOrders, diagnosticOrders, prescriptions, dispensings, claims, members, recentPatients, recentEncounters, recentAppointments] = await Promise.all([
    prisma.patient.findMany({ where: { clinicId }, select: { id: true, notes: true, createdAt: true } }),
    prisma.encounter.count({ where: { patient: { clinicId } } }),
    prisma.appointment.count({ where: { patient: { clinicId } } }),
    prisma.invoice.findMany({ where: { clinicId }, select: { total: true, amount: true, status: true, createdAt: true, doctorId: true, patient: { select: { notes: true } } } }),
    prisma.payment.findMany({ where: { invoice: { clinicId } }, select: { amount: true, method: true, paidAt: true, doctorId: true, patient: { select: { notes: true } } } }),
    prisma.labOrder.count({ where: { patient: { clinicId } } }),
    prisma.diagnosticOrder.count({ where: { patient: { clinicId } } }),
    prisma.prescription.count({ where: { patient: { clinicId } } }),
    prisma.dispensing.count({ where: { patient: { clinicId } } }),
    prisma.insuranceClaim.findMany({ where: { clinicId }, select: { requestedAmount: true, approvedAmount: true, settledAmount: true, status: true } }),
    prisma.clinicMember.findMany({ where: { clinicId }, include: { doctor: { select: { id: true, name: true } } } }),
    prisma.patient.findMany({ where: { clinicId, createdAt: { gte: start } }, select: { createdAt: true } }),
    prisma.encounter.findMany({ where: { patient: { clinicId }, createdAt: { gte: start } }, select: { createdAt: true } }),
    prisma.appointment.findMany({ where: { patient: { clinicId }, createdAt: { gte: start } }, select: { status: true, createdAt: true } }),
  ]);
  const recentInvoices = invoices.filter(x => x.createdAt >= start); const recentPayments = payments.filter(x => x.paidAt >= start);
  const billed = invoices.reduce((s, x) => s + Number(x.total ?? x.amount ?? 0), 0); const collected = payments.reduce((s, x) => s + Number(x.amount || 0), 0);
  const recentBilled = recentInvoices.reduce((s, x) => s + Number(x.total ?? x.amount ?? 0), 0); const recentCollected = recentPayments.reduce((s, x) => s + Number(x.amount || 0), 0); const outstanding = Math.max(0, billed - collected);
  const claimRequested = claims.reduce((s, x) => s + Number(x.requestedAmount || 0), 0); const claimApproved = claims.reduce((s, x) => s + Number(x.approvedAmount || 0), 0); const claimSettled = claims.reduce((s, x) => s + Number(x.settledAmount || 0), 0);
  const paymentMethods = payments.reduce((m:Record<string,number>, x) => { m[x.method] = (m[x.method] || 0) + Number(x.amount || 0); return m; }, {});
  const invoiceStatuses = invoices.reduce((m:Record<string,number>, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {}); const appointmentStatuses = recentAppointments.reduce((m:Record<string,number>, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {}); const claimStatuses = claims.reduce((m:Record<string,number>, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {});
  const patientIds = new Set(patients.filter(p => careSetting(p.notes) === "IPD").map(p => p.id));
  const settingCounts = { OPD: patients.length - patientIds.size, IPD: patientIds.size };
  const settingRevenue = { OPD: { billed: 0, collected: 0 }, IPD: { billed: 0, collected: 0 } };
  invoices.forEach(x => { const s = careSetting(x.patient.notes) as "OPD" | "IPD"; settingRevenue[s].billed += Number(x.total ?? x.amount ?? 0); });
  payments.forEach(x => { const s = careSetting(x.patient.notes) as "OPD" | "IPD"; settingRevenue[s].collected += Number(x.amount || 0); });
  const trend = Array.from({ length: days }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return { date: dayKey(d), patients: 0, encounters: 0, billed: 0, collected: 0 }; }); const trendMap = new Map(trend.map(x => [x.date, x]));
  recentPatients.forEach(x => trendMap.get(dayKey(x.createdAt))!.patients++); recentEncounters.forEach(x => trendMap.get(dayKey(x.createdAt))!.encounters++); recentInvoices.forEach(x => trendMap.get(dayKey(x.createdAt))!.billed += Number(x.total ?? x.amount ?? 0)); recentPayments.forEach(x => trendMap.get(dayKey(x.paidAt))!.collected += Number(x.amount || 0));
  const consultantMap = new Map<string, { doctorId:string; name:string; invoices:number; billed:number; collected:number }>(); members.forEach(m => consultantMap.set(m.doctor.id, { doctorId:m.doctor.id, name:m.doctor.name, invoices:0, billed:0, collected:0 }));
  invoices.forEach(x => { const c=consultantMap.get(x.doctorId); if(c){c.invoices++;c.billed+=Number(x.total??x.amount??0)} }); payments.forEach(x => { const c=consultantMap.get(x.doctorId); if(c)c.collected+=Number(x.amount||0) });
  return NextResponse.json({ periodDays:days, periodStart:start.toISOString(), counts:{patients:patients.length,encounters,appointments,invoices:invoices.length,payments:payments.length,labOrders,diagnosticOrders,prescriptions,dispensings,claims:claims.length}, periodCounts:{patients:recentPatients.length,encounters:recentEncounters.length,appointments:recentAppointments.length,invoices:recentInvoices.length,payments:recentPayments.length}, careSetting:{counts:settingCounts,revenue:settingRevenue}, revenue:{billed,collected,outstanding,periodBilled:recentBilled,periodCollected:recentCollected,collectionRate:billed>0?collected/billed:0}, insurance:{requested:claimRequested,approved:claimApproved,settled:claimSettled,byStatus:claimStatuses}, paymentMethods,invoiceStatuses,appointmentStatuses,trend,consultants:Array.from(consultantMap.values()).sort((a,b)=>b.collected-a.collected),generatedAt:new Date().toISOString() }, { headers:{"Cache-Control":"no-store"} });
}
