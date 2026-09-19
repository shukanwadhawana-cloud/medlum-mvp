import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPortalSession } from "@/lib/portal-session";

/**
 * Patient portal data — identity always from session, never from query params.
 */
export async function GET() {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.patientPortalAccount.findUnique({
    where: { id: session.accountId },
    select: { status: true, patientId: true },
  });
  if (!account || account.status !== "Active" || account.patientId !== session.patientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: session.patientId },
    select: {
      id: true,
      name: true,
      age: true,
      gender: true,
      phone: true,
      bp: true,
      allergies: true,
      notes: true,
      createdAt: true,
      clinic: { select: { id: true, name: true } },
      doctor: { select: { id: true, name: true } },
    },
  });
  if (!patient) {
    return NextResponse.json({ error: "Patient record not found" }, { status: 404 });
  }

  const patientId = patient.id;

  const [appointments, prescriptions, labs, diagnostics, invoices, policies, claims, encounters] =
    await Promise.all([
      prisma.appointment.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          date: true,
          time: true,
          type: true,
          status: true,
          patientName: true,
          createdAt: true,
          doctor: { select: { name: true } },
        },
      }),
      prisma.prescription.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          medicines: true,
          advice: true,
          createdAt: true,
          doctor: { select: { name: true } },
        },
      }),
      prisma.labOrder.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          testName: true,
          category: true,
          status: true,
          result: true,
          notes: true,
          orderedAt: true,
          resultedAt: true,
          doctor: { select: { name: true } },
        },
      }),
      prisma.diagnosticOrder.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          studyName: true,
          modality: true,
          bodyPart: true,
          status: true,
          findings: true,
          impression: true,
          notes: true,
          orderedAt: true,
          reportedAt: true,
          doctor: { select: { name: true } },
        },
      }),
      prisma.invoice.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          amount: true,
          subtotal: true,
          discount: true,
          tax: true,
          total: true,
          status: true,
          note: true,
          dueDate: true,
          createdAt: true,
          items: {
            select: {
              description: true,
              category: true,
              quantity: true,
              unitPrice: true,
              amount: true,
            },
          },
          payments: {
            select: { amount: true, method: true, paidAt: true, reference: true },
          },
        },
      }),
      prisma.insurancePolicy.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          policyNumber: true,
          memberId: true,
          planName: true,
          policyHolderName: true,
          relationship: true,
          validFrom: true,
          validTo: true,
          sumInsured: true,
          status: true,
          provider: { select: { name: true, type: true, tpaName: true } },
        },
      }),
      prisma.insuranceClaim.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          claimNumber: true,
          preauthNumber: true,
          claimType: true,
          status: true,
          requestedAmount: true,
          approvedAmount: true,
          settledAmount: true,
          submittedAt: true,
          approvedAt: true,
          settledAt: true,
          rejectionReason: true,
          createdAt: true,
          policy: {
            select: { policyNumber: true, provider: { select: { name: true } } },
          },
        },
      }),
      prisma.encounter.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          date: true,
          chiefComplaint: true,
          diagnosis: true,
          assessment: true,
          plan: true,
          followUpDate: true,
          bp: true,
          pulse: true,
          temperature: true,
          spo2: true,
          weight: true,
          height: true,
          createdAt: true,
          doctor: { select: { name: true } },
        },
      }),
    ]);

  return NextResponse.json(
    {
      patient,
      appointments,
      prescriptions,
      labs,
      diagnostics,
      invoices,
      policies,
      claims,
      encounters,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
