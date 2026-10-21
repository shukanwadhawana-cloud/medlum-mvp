import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  requireActiveClinicMembership,
  findAuthorizedPatient,
  isMembershipManager,
} from "@/lib/clinic-auth";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patientId = String(body.patientId || "");
  const action = String(body.action || "");
  const reason = String(body.reason || "").slice(0, 500);

  // Discharging a patient must only happen through the IPD workflow, which
  // atomically final-signs a submitted discharge note with a second clinician.
  // This legacy endpoint must never mutate Patient.status directly.
  if (action === "discharge") {
    return NextResponse.json({
      success: false,
      error: "Direct discharge is disabled. Use the IPD discharge-summary workflow for independent verification and final signing.",
      code: "USE_IPD_DISCHARGE_WORKFLOW",
    }, { status: 409 });
  }

  if (!patientId || !["soft-delete", "restore"].includes(action)) {
    return NextResponse.json(
      { success: false, error: "patientId and action (discharge|soft-delete|restore) required" },
      { status: 400 }
    );
  }

  if ((action === "soft-delete" || action === "restore") && !isMembershipManager(membership.role)) {
    return NextResponse.json({ success: false, error: "Not permitted" }, { status: 403 });
  }

  const patient = await findAuthorizedPatient(membership, patientId, {
    includeDeleted: action === "restore",
  });
  if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });

  if (action === "soft-delete") {
    const updated = await prisma.patient.update({
      where: { id: patient.id },
      data: {
        deletedAt: new Date(),
        deletedBy: session.doctorId,
        deletionReason: reason || "soft-delete",
      },
    });
    await writeAudit({
      doctorId: session.doctorId,
      action: "soft_delete",
      entity: "Patient",
      entityId: patient.id,
      meta: { reason },
    });
    return NextResponse.json({ success: true, patient: { id: updated.id, deletedAt: updated.deletedAt } });
  }

  const updated = await prisma.patient.update({
    where: { id: patient.id },
    data: {
      deletedAt: null,
      deletedBy: null,
      deletionReason: "",
      status: "ACTIVE",
    },
  });
  await writeAudit({
    doctorId: session.doctorId,
    action: "restore",
    entity: "Patient",
    entityId: patient.id,
  });
  return NextResponse.json({ success: true, patient: { id: updated.id, status: updated.status, deletedAt: null } });
}
