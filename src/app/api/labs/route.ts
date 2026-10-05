import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership, findAuthorizedPatient } from "@/lib/clinic-auth";
import { canEnterLabResult, canOrderLabs } from "@/lib/permissions";

/** Statuses the lab work queue UI and PATCH accept (must stay in sync with labs page). */
const LAB_STATUSES = new Set([
  "Ordered",
  "Sample Pending",
  "Collected",
  "Sample Collected",
  "Processing",
  "Result Available",
  "Awaiting Review",
  "Resulted",
  "Reviewed",
  "Completed",
  "Cancelled",
]);

const RESULT_STATUSES = new Set(["Resulted", "Reviewed", "Completed", "Result Available"]);

async function getClinicId(doctorId: string) {
  const membership = await requireActiveClinicMembership(doctorId);
  return membership?.clinicId || null;
}

/**
 * Resolve a patient via canonical findAuthorizedPatient (facility scope + safe legacy null clinicId).
 */
async function getSharedPatient(patientId: string, doctorId: string) {
  const membership = await requireActiveClinicMembership(doctorId);
  if (!membership) return null;
  return findAuthorizedPatient(membership, patientId);
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clinicId = await getClinicId(session.doctorId);
  if (!clinicId) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  if (patientId && !(await getSharedPatient(patientId, session.doctorId))) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  const orders = await prisma.labOrder.findMany({
    where: patientId
      ? { patientId, patient: { OR: [{ clinicId }, { clinicId: null, doctorId: session.doctorId }] } }
      : { patient: { OR: [{ clinicId }, { clinicId: null, doctorId: session.doctorId }] } },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
  return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  if (!canOrderLabs(membership.role)) {
    return NextResponse.json({ success: false, error: "Insufficient role permissions for this operation.", code: "RBAC_DENIED" }, { status: 403 });
  }
  try {
    const body = await req.json();
    void body.clinicId;
    void body.facilityId;
    const patientId = String(body.patientId || "");
    const testName = String(body.testName || "").trim();
    if (!patientId || !testName)
      return NextResponse.json({ success: false, error: "Patient and test are required" }, { status: 400 });
    const patient = await getSharedPatient(patientId, session.doctorId);
    if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    let encounterId: string | null = body.encounterId ? String(body.encounterId) : null;
    if (encounterId) {
      const encounter = await prisma.encounter.findFirst({
        where: { id: encounterId, patientId, doctorId: session.doctorId },
      });
      if (!encounter) encounterId = null;
    }
    const order = await prisma.labOrder.create({
      data: {
        doctorId: session.doctorId,
        patientId,
        encounterId,
        patientName: patient.name,
        testName,
        category: String(body.category || "Laboratory"),
        notes: String(body.notes || ""),
      },
    });
    await writeAudit({
      doctorId: session.doctorId,
      action: "create",
      entity: "LabOrder",
      entityId: order.id,
      meta: { patientId, encounterId, testName },
    });
    return NextResponse.json({ success: true, order });
  } catch (e) {
    console.error("create lab order", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membershipForRole = await requireActiveClinicMembership(session.doctorId);
  if (!membershipForRole) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  if (!canEnterLabResult(membershipForRole.role) && !canOrderLabs(membershipForRole.role)) {
    return NextResponse.json({ success: false, error: "Insufficient role permissions for this operation.", code: "RBAC_DENIED" }, { status: 403 });
  }
  const clinicId = membershipForRole.clinicId;
  try {
    const body = await req.json();
    const id = String(body.id || "");
    const status = String(body.status || "");
    if (!id || !LAB_STATUSES.has(status)) {
      return NextResponse.json({ success: false, error: "Invalid update" }, { status: 400 });
    }
    const existing = await prisma.labOrder.findFirst({
      where: { id, patient: { OR: [{ clinicId }, { clinicId: null, doctorId: session.doctorId }] } },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Lab order not found" }, { status: 404 });
    if (status === "Reviewed") {
      if (existing.status === "Reviewed" || existing.status === "Completed") {
        return NextResponse.json({ success: false, error: "Investigation is already clinically reviewed." }, { status: 409 });
      }
      if (!["Resulted", "Result Available", "Awaiting Review"].includes(existing.status)) {
        return NextResponse.json({ success: false, error: "Investigation must have an available result before review." }, { status: 409 });
      }
      if (!String(existing.result || body.result || "").trim()) {
        return NextResponse.json({ success: false, error: "A result is required before clinical review." }, { status: 400 });
      }
    }
    const result = RESULT_STATUSES.has(status)
      ? String(body.result || existing.result || "")
      : existing.result;
    const notes = body.notes === undefined ? existing.notes : String(body.notes || "");
    const order = await prisma.labOrder.update({
      where: { id },
      data: {
        status,
        result,
        notes,
        resultedAt: RESULT_STATUSES.has(status)
          ? existing.resultedAt || new Date()
          : existing.resultedAt,
      },
    });
    await writeAudit({
      doctorId: session.doctorId,
      action: "update",
      entity: "LabOrder",
      entityId: id,
      meta: { status, hasResult: Boolean(result) },
    });
    return NextResponse.json({ success: true, order });
  } catch (e) {
    console.error("update lab order", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
