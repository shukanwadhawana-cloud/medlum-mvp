import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

async function getContext() {
  const session = await getSession();
  if (!session) return null;
  const membership = await prisma.clinicMember.findFirst({ where: { doctorId: session.doctorId }, orderBy: { createdAt: "asc" } });
  if (!membership) return null;
  return { session, clinicId: membership.clinicId };
}

const dec = (v: unknown) => Math.max(0, Number(v || 0));
const dateOrNull = (v: unknown) => v ? new Date(String(v)) : null;

export async function GET() {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [providers, policies, claims] = await Promise.all([
    prisma.insuranceProvider.findMany({ where: { clinicId: ctx.clinicId }, orderBy: { name: "asc" }, include: { policies: { select: { id: true } } } }),
    prisma.insurancePolicy.findMany({ where: { clinicId: ctx.clinicId }, orderBy: { createdAt: "desc" }, include: { provider: true, patient: { select: { id: true, name: true, phone: true } }, claims: { orderBy: { createdAt: "desc" }, take: 10 } } }),
    prisma.insuranceClaim.findMany({ where: { clinicId: ctx.clinicId }, orderBy: { createdAt: "desc" }, include: { patient: { select: { id: true, name: true, phone: true } }, policy: { include: { provider: true } }, invoice: { select: { id: true, patientName: true, total: true, status: true } } }, take: 200 }),
  ]);
  return NextResponse.json({ providers, policies, claims }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "provider") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ success: false, error: "Provider name is required." }, { status: 400 });
      const provider = await prisma.insuranceProvider.create({ data: { clinicId: ctx.clinicId, name, code: String(body.code || "").trim(), type: String(body.type || "Insurer"), phone: String(body.phone || "").trim(), email: String(body.email || "").trim(), portalUrl: String(body.portalUrl || "").trim(), tpaName: String(body.tpaName || "").trim(), notes: String(body.notes || "").trim() } });
      await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "INSURANCE_PROVIDER_CREATED", entity: "InsuranceProvider", entityId: provider.id, meta: JSON.stringify({ clinicId: ctx.clinicId, name }) } });
      return NextResponse.json({ success: true, provider });
    }

    if (action === "policy") {
      const patientId = String(body.patientId || "");
      const providerId = String(body.providerId || "");
      const policyNumber = String(body.policyNumber || "").trim();
      if (!patientId || !providerId || !policyNumber) return NextResponse.json({ success: false, error: "Patient, provider and policy number are required." }, { status: 400 });
      const [patient, provider] = await Promise.all([
        prisma.patient.findFirst({ where: { id: patientId, clinicId: ctx.clinicId } }),
        prisma.insuranceProvider.findFirst({ where: { id: providerId, clinicId: ctx.clinicId, status: "Active" } }),
      ]);
      if (!patient) return NextResponse.json({ success: false, error: "Patient not found in this clinic." }, { status: 404 });
      if (!provider) return NextResponse.json({ success: false, error: "Insurance provider not found or inactive." }, { status: 404 });
      const policy = await prisma.insurancePolicy.create({ data: { clinicId: ctx.clinicId, patientId, providerId, policyNumber, memberId: String(body.memberId || "").trim(), planName: String(body.planName || "").trim(), policyHolderName: String(body.policyHolderName || "").trim(), relationship: String(body.relationship || "").trim(), validFrom: dateOrNull(body.validFrom), validTo: dateOrNull(body.validTo), sumInsured: dec(body.sumInsured), status: String(body.status || "Active"), notes: String(body.notes || "").trim() } });
      await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "INSURANCE_POLICY_CREATED", entity: "InsurancePolicy", entityId: policy.id, meta: JSON.stringify({ clinicId: ctx.clinicId, patientId, providerId, policyNumber }) } });
      return NextResponse.json({ success: true, policy });
    }

    if (action === "claim") {
      const patientId = String(body.patientId || "");
      const policyId = String(body.policyId || "");
      if (!patientId || !policyId) return NextResponse.json({ success: false, error: "Patient and policy are required." }, { status: 400 });
      const policy = await prisma.insurancePolicy.findFirst({ where: { id: policyId, patientId, clinicId: ctx.clinicId } });
      if (!policy) return NextResponse.json({ success: false, error: "Insurance policy not found for this patient." }, { status: 404 });
      let invoiceId: string | null = body.invoiceId ? String(body.invoiceId) : null;
      let requestedAmount = dec(body.requestedAmount);
      if (invoiceId) {
        const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, patientId, clinicId: ctx.clinicId } });
        if (!invoice) return NextResponse.json({ success: false, error: "Invoice not found for this patient." }, { status: 404 });
        if (!requestedAmount) requestedAmount = Number(invoice.total ?? invoice.amount ?? 0);
      }
      if (requestedAmount <= 0) return NextResponse.json({ success: false, error: "Requested claim amount must be greater than zero." }, { status: 400 });
      const claim = await prisma.insuranceClaim.create({ data: { clinicId: ctx.clinicId, patientId, policyId, invoiceId, claimNumber: String(body.claimNumber || "").trim(), preauthNumber: String(body.preauthNumber || "").trim(), claimType: String(body.claimType || "OPD"), status: "Draft", requestedAmount, approvedAmount: 0, settledAmount: 0, rejectionReason: "", notes: String(body.notes || "").trim() } });
      await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "INSURANCE_CLAIM_CREATED", entity: "InsuranceClaim", entityId: claim.id, meta: JSON.stringify({ clinicId: ctx.clinicId, patientId, policyId, invoiceId, requestedAmount }) } });
      return NextResponse.json({ success: true, claim });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("insurance post", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const action = String(body.action || "");
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ success: false, error: "Record id is required." }, { status: 400 });

    if (action === "provider") {
      const existing = await prisma.insuranceProvider.findFirst({ where: { id, clinicId: ctx.clinicId } });
      if (!existing) return NextResponse.json({ success: false, error: "Provider not found." }, { status: 404 });
      const provider = await prisma.insuranceProvider.update({ where: { id }, data: { name: body.name === undefined ? existing.name : String(body.name).trim(), code: body.code === undefined ? existing.code : String(body.code).trim(), type: body.type === undefined ? existing.type : String(body.type), phone: body.phone === undefined ? existing.phone : String(body.phone).trim(), email: body.email === undefined ? existing.email : String(body.email).trim(), portalUrl: body.portalUrl === undefined ? existing.portalUrl : String(body.portalUrl).trim(), tpaName: body.tpaName === undefined ? existing.tpaName : String(body.tpaName).trim(), notes: body.notes === undefined ? existing.notes : String(body.notes).trim(), status: body.status === undefined ? existing.status : String(body.status) } });
      await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "INSURANCE_PROVIDER_UPDATED", entity: "InsuranceProvider", entityId: id, meta: JSON.stringify({ clinicId: ctx.clinicId, status: provider.status }) } });
      return NextResponse.json({ success: true, provider });
    }

    if (action === "policy") {
      const existing = await prisma.insurancePolicy.findFirst({ where: { id, clinicId: ctx.clinicId } });
      if (!existing) return NextResponse.json({ success: false, error: "Policy not found." }, { status: 404 });
      const patientId = body.patientId === undefined ? existing.patientId : String(body.patientId);
      const providerId = body.providerId === undefined ? existing.providerId : String(body.providerId);
      const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: ctx.clinicId } });
      const provider = await prisma.insuranceProvider.findFirst({ where: { id: providerId, clinicId: ctx.clinicId } });
      if (!patient || !provider) return NextResponse.json({ success: false, error: "Patient or provider is outside this clinic." }, { status: 400 });
      const policy = await prisma.insurancePolicy.update({ where: { id }, data: { patientId, providerId, policyNumber: body.policyNumber === undefined ? existing.policyNumber : String(body.policyNumber).trim(), memberId: body.memberId === undefined ? existing.memberId : String(body.memberId).trim(), planName: body.planName === undefined ? existing.planName : String(body.planName).trim(), policyHolderName: body.policyHolderName === undefined ? existing.policyHolderName : String(body.policyHolderName).trim(), relationship: body.relationship === undefined ? existing.relationship : String(body.relationship).trim(), validFrom: body.validFrom === undefined ? existing.validFrom : dateOrNull(body.validFrom), validTo: body.validTo === undefined ? existing.validTo : dateOrNull(body.validTo), sumInsured: body.sumInsured === undefined ? existing.sumInsured : dec(body.sumInsured), status: body.status === undefined ? existing.status : String(body.status), notes: body.notes === undefined ? existing.notes : String(body.notes).trim() } });
      await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "INSURANCE_POLICY_UPDATED", entity: "InsurancePolicy", entityId: id, meta: JSON.stringify({ clinicId: ctx.clinicId, patientId, providerId }) } });
      return NextResponse.json({ success: true, policy });
    }

    if (action === "claim") {
      const existing = await prisma.insuranceClaim.findFirst({ where: { id, clinicId: ctx.clinicId } });
      if (!existing) return NextResponse.json({ success: false, error: "Claim not found." }, { status: 404 });
      const status = body.status === undefined ? existing.status : String(body.status);
      const approvedAmount = body.approvedAmount === undefined ? Number(existing.approvedAmount) : dec(body.approvedAmount);
      const settledAmount = body.settledAmount === undefined ? Number(existing.settledAmount) : dec(body.settledAmount);
      const requestedAmount = Number(existing.requestedAmount);
      if (approvedAmount > requestedAmount) return NextResponse.json({ success: false, error: "Approved amount cannot exceed requested amount." }, { status: 400 });
      if (settledAmount > approvedAmount) return NextResponse.json({ success: false, error: "Settled amount cannot exceed approved amount." }, { status: 400 });
      const claim = await prisma.insuranceClaim.update({ where: { id }, data: { status, claimNumber: body.claimNumber === undefined ? existing.claimNumber : String(body.claimNumber).trim(), preauthNumber: body.preauthNumber === undefined ? existing.preauthNumber : String(body.preauthNumber).trim(), claimType: body.claimType === undefined ? existing.claimType : String(body.claimType), approvedAmount, settledAmount, submittedAt: status === "Submitted" && !existing.submittedAt ? new Date() : existing.submittedAt, approvedAt: status === "Approved" && !existing.approvedAt ? new Date() : existing.approvedAt, settledAt: status === "Settled" && !existing.settledAt ? new Date() : existing.settledAt, rejectionReason: body.rejectionReason === undefined ? existing.rejectionReason : String(body.rejectionReason).trim(), notes: body.notes === undefined ? existing.notes : String(body.notes).trim() } });
      await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "INSURANCE_CLAIM_UPDATED", entity: "InsuranceClaim", entityId: id, meta: JSON.stringify({ clinicId: ctx.clinicId, status, approvedAmount, settledAmount }) } });
      return NextResponse.json({ success: true, claim });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("insurance patch", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
