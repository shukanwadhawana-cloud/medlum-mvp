import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { writeAudit } from "@/lib/audit";
import { getPlatformAccess, getClinicSubscription, isPlatformRole } from "@/lib/platform";
import { ensurePrimaryClinic } from "@/lib/ensure-clinic";

const STAFF_ROLES = ["PlatformAdmin", "PlatformSupport", "PlatformDeveloper", "PlatformBilling"] as const;

export async function GET() {
  const access = await getPlatformAccess();
  if (!access) return NextResponse.json({ error: "Platform access required" }, { status: 403 });
  if (access.role === "PlatformDeveloper") return NextResponse.json({ error: "Developer role cannot view financial dashboard" }, { status: 403 });

  const clinics = await prisma.clinic.findMany({ orderBy: { createdAt: "desc" }, include: { members: { where: { isActive: true }, include: { doctor: { select: { id: true, name: true, email: true, isActive: true } } } } } });
  const visibleClinics = clinics.filter((c) => !c.members.some((m) => isPlatformRole(m.role)));
  const rows = await Promise.all(visibleClinics.map(async (clinic) => {
    const [patients, invoices, payments, subscription] = await Promise.all([
      prisma.patient.count({ where: { clinicId: clinic.id } }),
      prisma.invoice.findMany({ where: { clinicId: clinic.id }, select: { total: true, amount: true, status: true } }),
      prisma.payment.findMany({ where: { invoice: { clinicId: clinic.id } }, select: { amount: true } }),
      getClinicSubscription(clinic.id),
    ]);
    const pending = invoices.filter((i) => !["PAID", "Paid", "paid"].includes(i.status)).reduce((s, i) => s + Number(i.total ?? i.amount ?? 0), 0);
    const collected = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    return { id: clinic.id, name: clinic.name, active: clinic.isActive, doctors: clinic.members.filter((m) => !isPlatformRole(m.role)).map((m) => ({ id: m.doctor.id, name: m.doctor.name, email: m.doctor.email, role: m.role, active: m.doctor.isActive })), patients, subscription, invoicePendingAmount: pending, collected };
  }));

  const allInvoices = await prisma.invoice.findMany({ where: { clinicId: { not: null } }, select: { total: true, amount: true, status: true } });
  const allPayments = await prisma.payment.findMany({ where: { invoice: { clinicId: { not: null } } }, select: { amount: true } });
  const totalPatients = await prisma.patient.count({ where: { clinicId: { not: null } } });
  const totalCollected = allPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalInvoiced = allInvoices.reduce((s, i) => s + Number(i.total ?? i.amount ?? 0), 0);
  const pendingPayments = allInvoices.filter((i) => !["PAID", "Paid", "paid"].includes(i.status)).reduce((s, i) => s + Number(i.total ?? i.amount ?? 0), 0);

  return NextResponse.json({ success: true, viewer: { role: access.role, name: access.clinicName }, summary: { clinics: rows.length, activeClinics: rows.filter((r) => r.active && r.subscription.status === "ACTIVE").length, suspendedClinics: rows.filter((r) => ["SUSPENDED", "EXPIRED", "PAST_DUE", "CANCELLED"].includes(r.subscription.status)).length, doctors: rows.reduce((s, r) => s + r.doctors.length, 0), patients: totalPatients, totalInvoiced, totalCollected, pendingPayments }, clinics: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "bootstrap") {
    const secret = String(body.bootstrapSecret || "");
    if (!process.env.MEDLUM_PLATFORM_BOOTSTRAP_SECRET || secret !== process.env.MEDLUM_PLATFORM_BOOTSTRAP_SECRET) return NextResponse.json({ success: false, error: "Invalid bootstrap secret" }, { status: 403 });
    const name = String(body.name || "MedLum Founder").trim();
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");
    if (!email || password.length < 8) return NextResponse.json({ success: false, error: "Valid email and password (8+ chars) required" }, { status: 400 });
    let doctor = await prisma.doctor.findUnique({ where: { email } });
    if (!doctor) doctor = await prisma.doctor.create({ data: { name, email, passwordHash: await hashPassword(password), clinicName: "MedLum Platform", phone: "" } });
    else if (!(await prisma.clinicMember.findFirst({ where: { doctorId: doctor.id, role: { in: [...STAFF_ROLES] }, isActive: true } }))) await prisma.doctor.update({ where: { id: doctor.id }, data: { name, passwordHash: await hashPassword(password), isActive: true, clinicName: "MedLum Platform" } });
    const clinicId = await ensurePrimaryClinic(doctor.id, "MedLum Platform");
    await prisma.clinicMember.updateMany({ where: { doctorId: doctor.id, clinicId }, data: { role: "PlatformAdmin", isActive: true, deactivatedAt: null } });
    return NextResponse.json({ success: true, message: "Platform administrator ready", email, doctorId: doctor.id });
  }

  const access = await getPlatformAccess();
  if (!access) return NextResponse.json({ error: "Platform access required" }, { status: 403 });
  if (access.role !== "PlatformAdmin") return NextResponse.json({ error: "Platform administrator access required" }, { status: 403 });

  if (action === "create-user") {
    const role = String(body.role || "PlatformSupport");
    if (!(STAFF_ROLES as readonly string[]).includes(role)) return NextResponse.json({ success: false, error: "Invalid platform role" }, { status: 400 });
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    if (!email || !name || password.length < 8) return NextResponse.json({ success: false, error: "Name, email and 8+ character password required" }, { status: 400 });
    if (await prisma.doctor.findUnique({ where: { email } })) return NextResponse.json({ success: false, error: "Email already registered" }, { status: 409 });
    const doctor = await prisma.doctor.create({ data: { name, email, passwordHash: await hashPassword(password), clinicName: "MedLum Platform", phone: "" } });
    const clinicId = await ensurePrimaryClinic(doctor.id, "MedLum Platform");
    await prisma.clinicMember.updateMany({ where: { doctorId: doctor.id, clinicId }, data: { role, isActive: true, deactivatedAt: null } });
    await writeAudit({ doctorId: access.session.doctorId, action: "create", entity: "PlatformUser", entityId: doctor.id, meta: { role, email } });
    return NextResponse.json({ success: true, user: { id: doctor.id, name, email, role } });
  }

  if (action === "subscription") {
    const clinicId = String(body.clinicId || "");
    if (!clinicId) return NextResponse.json({ success: false, error: "clinicId required" }, { status: 400 });
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) return NextResponse.json({ success: false, error: "Clinic not found" }, { status: 404 });
    const patientLimit = Math.max(1, parseInt(String(body.patientLimit || 200), 10) || 200);
    const status = String(body.status || "ACTIVE").toUpperCase();
    const dueDate = body.dueDate ? new Date(String(body.dueDate)).toISOString() : null;
    await writeAudit({ doctorId: access.session.doctorId, action: "update", entity: "ClinicSubscription", entityId: clinicId, meta: { plan: String(body.plan || "Pilot"), patientLimit, status, dueDate } });
    return NextResponse.json({ success: true, subscription: await getClinicSubscription(clinicId) });
  }

  return NextResponse.json({ success: false, error: "Unknown platform action" }, { status: 400 });
}
