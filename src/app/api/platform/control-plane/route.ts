import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPlatformProducts } from "@/lib/platform-control-plane";
import { getPlatformSession } from "@/lib/platform-session";

const CUSTOMER_CLINIC_FILTER = { name: { not: "MedLum Platform" } };

export async function GET() {
  const owner = await getPlatformSession();
  if (!owner) return NextResponse.json({ success: false, error: "Platform owner authentication required" }, { status: 401 });

  try {
    const products = await getPlatformProducts();
    const clinics = await prisma.clinic.findMany({
      where: CUSTOMER_CLINIC_FILTER,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        members: { where: { isActive: true }, select: { doctorId: true, role: true, doctor: { select: { id: true, name: true, email: true, isActive: true } } } },
      },
    });

    const [patients, invoices, payments, appointments, encounters] = await Promise.all([
      prisma.patient.count({ where: { clinicId: { not: null }, clinic: CUSTOMER_CLINIC_FILTER } }),
      prisma.invoice.findMany({ where: { clinicId: { not: null }, clinic: CUSTOMER_CLINIC_FILTER }, select: { total: true, amount: true, status: true, createdAt: true } }),
      prisma.payment.findMany({ where: { invoice: { clinicId: { not: null }, clinic: CUSTOMER_CLINIC_FILTER } }, select: { amount: true, paidAt: true } }),
      prisma.appointment.count({ where: { doctor: { clinicMemberships: { some: { clinic: CUSTOMER_CLINIC_FILTER } } } } }),
      prisma.encounter.count({ where: { doctor: { clinicMemberships: { some: { clinic: CUSTOMER_CLINIC_FILTER } } } } }),
    ]);

    const revenue = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const invoiced = invoices.reduce((sum, invoice) => sum + Number(invoice.total ?? invoice.amount ?? 0), 0);
    const pending = invoices.filter((invoice) => !["PAID", "Paid", "paid"].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.total ?? invoice.amount ?? 0), 0);
    const activeDoctors = new Set(clinics.flatMap((clinic) => clinic.members.filter((member) => member.doctor.isActive).map((member) => member.doctorId))).size;
    const activeUsers = new Set(clinics.flatMap((clinic) => clinic.members.map((member) => member.doctorId))).size;
    const monthlyRevenue = new Map<string, number>();
    for (const payment of payments) {
      const key = payment.paidAt.toISOString().slice(0, 7);
      monthlyRevenue.set(key, (monthlyRevenue.get(key) || 0) + Number(payment.amount || 0));
    }

    return NextResponse.json({
      success: true,
      owner: { id: owner.ownerId, email: owner.email, name: owner.name },
      products: products.map((product) => ({ key: product.key, name: product.name, slug: product.slug, description: product.description, active: product.active })),
      summary: {
        products: products.length,
        organizations: clinics.length,
        activeOrganizations: clinics.filter((clinic) => clinic.isActive).length,
        activeUsers,
        activeDoctors,
        patients,
        appointments,
        encounters,
        totalInvoiced: invoiced,
        totalCollected: revenue,
        pendingPayments: pending,
        mrr: null,
        mrrStatus: "Not modeled yet — clinic subscription pricing is not stored as recurring billing data.",
      },
      trends: Array.from(monthlyRevenue.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, value]) => ({ month, collected: value })),
      productsDetail: [{
        key: "medlum-mvp",
        name: "MedLum MVP",
        organizations: clinics.length,
        activeUsers,
        patients,
        appointments,
        encounters,
        revenueCollected: revenue,
      }],
      organizations: clinics.map((clinic) => ({
        id: clinic.id,
        name: clinic.name,
        active: clinic.isActive,
        onboardedAt: clinic.createdAt.toISOString(),
        users: clinic.members.length,
        doctors: clinic.members.filter((member) => member.doctor.isActive).length,
      })),
    });
  } catch (error) {
    console.error("platform control-plane dashboard error", error);
    return NextResponse.json({ success: false, error: "Unable to load platform dashboard" }, { status: 500 });
  }
}
