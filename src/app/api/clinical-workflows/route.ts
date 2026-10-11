import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { findAuthorizedPatient, normalizeClinicRole, requireActiveClinicMembership } from "@/lib/clinic-auth";

const MODULES = new Set(["Physiotherapy", "Dietitian"]);
const CLINICAL_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Nurse", "Physiotherapist", "Dietitian", "Dietician", "Nutritionist"]);
const APPROVER_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "Dietitian", "Dietician", "Nutritionist"]);

async function context() {
  const session = await getSession();
  if (!session) return null;
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return null;
  const role = normalizeClinicRole(membership.role);
  if (!CLINICAL_ROLES.has(role)) return null;
  return { session, membership, role };
}

function safeData(value: unknown): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Record data must be an object.");
  const encoded = JSON.stringify(value);
  if (encoded.length > 20000) throw new Error("Record details are too large.");
  return value as Prisma.InputJsonValue;
}

function recordPatientId(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const value = (data as Record<string, unknown>).patientId;
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(req: Request) {
  const c = await context();
  if (!c) return NextResponse.json({ success: false, error: "Clinical module access is not authorized." }, { status: 403 });
  const url = new URL(req.url);
  const module = url.searchParams.get("module") || "";
  const patientId = url.searchParams.get("patientId") || "";
  if (!MODULES.has(module)) return NextResponse.json({ success: false, error: "Unknown clinical workflow module." }, { status: 400 });
  if (patientId && !(await findAuthorizedPatient(c.membership, patientId))) return NextResponse.json({ success: false, error: "Patient not found in this clinic." }, { status: 404 });
  const rows = await prisma.workforceRecord.findMany({
    where: { clinicId: c.membership.clinicId, module },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const records = rows.filter((row) => !patientId || recordPatientId(row.data) === patientId);
  return NextResponse.json({ success: true, records }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const c = await context();
  if (!c) return NextResponse.json({ success: false, error: "Clinical module access is not authorized." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const module = typeof body.module === "string" ? body.module.trim() : "";
  const recordType = typeof body.recordType === "string" ? body.recordType.trim().slice(0, 80) : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
  const patientId = recordPatientId(body.data);
  if (!MODULES.has(module) || !recordType || !title || !patientId) {
    return NextResponse.json({ success: false, error: "Module, record type, title and patient are required." }, { status: 400 });
  }
  const patient = await findAuthorizedPatient(c.membership, patientId);
  if (!patient) return NextResponse.json({ success: false, error: "Patient not found in this clinic." }, { status: 404 });
  let data: Prisma.InputJsonValue;
  try { data = safeData({ ...(body.data as Record<string, unknown>), patientId, patientName: patient.name }); }
  catch (e) { return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Invalid record data." }, { status: 400 }); }
  const row = await prisma.workforceRecord.create({
    data: {
      clinicId: c.membership.clinicId,
      memberId: c.membership.membershipId || null,
      module,
      recordType,
      title,
      status: "DRAFT",
      data,
      startAt: body.startAt ? new Date(body.startAt) : null,
      endAt: body.endAt ? new Date(body.endAt) : null,
      createdBy: c.session.doctorId,
    },
  });
  await writeAudit({ doctorId: c.session.doctorId, clinicId: c.membership.clinicId, action: "CLINICAL_WORKFLOW_CREATED", entity: "WorkforceRecord", entityId: row.id, meta: { module, recordType, patientId, status: "DRAFT" } });
  return NextResponse.json({ success: true, record: row }, { status: 201 });
}

export async function PATCH(req: Request) {
  const c = await context();
  if (!c) return NextResponse.json({ success: false, error: "Clinical module access is not authorized." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ success: false, error: "Record ID is required." }, { status: 400 });
  const existing = await prisma.workforceRecord.findFirst({ where: { id, clinicId: c.membership.clinicId } });
  if (!existing || !MODULES.has(existing.module)) return NextResponse.json({ success: false, error: "Clinical workflow record not found." }, { status: 404 });
  const patientId = recordPatientId(existing.data);
  if (!patientId || !(await findAuthorizedPatient(c.membership, patientId))) return NextResponse.json({ success: false, error: "Patient is not accessible in this clinic." }, { status: 404 });
  const status = typeof body.status === "string" ? body.status.trim() : existing.status;
  if (!["DRAFT", "IN_REVIEW", "APPROVED", "CANCELLED"].includes(status)) return NextResponse.json({ success: false, error: "Invalid workflow status." }, { status: 400 });
  if (status === "APPROVED" && !APPROVER_ROLES.has(c.role)) return NextResponse.json({ success: false, error: "Only an authorized clinician/dietitian or clinical manager may approve this record." }, { status: 403 });
  if (existing.module === "Dietitian" && status === "APPROVED" && (existing.data as any)?.recordKind === "AI_DIET_CHART_DRAFT" && !APPROVER_ROLES.has(c.role)) {
    return NextResponse.json({ success: false, error: "AI diet charts require authorized professional approval." }, { status: 403 });
  }
  let data: Prisma.InputJsonValue = existing.data as Prisma.InputJsonValue;
  if (body.data !== undefined) {
    try {
      const supplied = safeData(body.data) as unknown as Record<string, unknown>;
      if (recordPatientId(supplied) && recordPatientId(supplied) !== patientId) return NextResponse.json({ success: false, error: "A workflow record cannot be reassigned to another patient." }, { status: 400 });
      data = safeData({ ...(supplied as Record<string, unknown>), patientId, ...(status === "APPROVED" ? { approvedBy: c.session.doctorId, approvedAt: new Date().toISOString() } : {}) });
    } catch (e) { return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Invalid record data." }, { status: 400 }); }
  } else if (status === "APPROVED") {
    data = safeData({ ...((existing.data as unknown as Record<string, unknown>) || {}), approvedBy: c.session.doctorId, approvedAt: new Date().toISOString() });
  }
  const row = await prisma.workforceRecord.update({
    where: { id },
    data: { status, title: typeof body.title === "string" ? body.title.trim().slice(0, 160) || existing.title : existing.title, data },
  });
  await writeAudit({ doctorId: c.session.doctorId, clinicId: c.membership.clinicId, action: status === "APPROVED" ? "CLINICAL_WORKFLOW_APPROVED" : "CLINICAL_WORKFLOW_UPDATED", entity: "WorkforceRecord", entityId: row.id, meta: { module: existing.module, patientId, status } });
  return NextResponse.json({ success: true, record: row });
}
