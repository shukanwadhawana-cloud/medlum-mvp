import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  requireAuthz,
  requirePermission,
  requireAuthorizedPatient,
  discardClientFacilitySelectors,
} from "@/lib/server-authz";

export async function GET() {
  const auth = await requireAuthz();
  if (!auth.ok) return auth.response;
  // Viewing prescriptions requires clinical chart or prescribe capability
  const perm = requirePermission(auth.ctx, "view_clinical_chart");
  const canRx = requirePermission(auth.ctx, "prescribe");
  if (!perm.ok && !canRx.ok) {
    return NextResponse.json(
      { success: false, error: "Insufficient role permissions for this operation.", code: "RBAC_DENIED" },
      { status: 403 }
    );
  }
  const list = await prisma.prescription.findMany({
    where: { patient: { clinicId: auth.ctx.membership.clinicId } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ prescriptions: list });
}

export async function POST(req: Request) {
  const auth = await requireAuthz();
  if (!auth.ok) return auth.response;
  const perm = requirePermission(auth.ctx, "prescribe");
  if (!perm.ok) return perm.response;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    discardClientFacilitySelectors(body);
    const patientId = String(body.patientId || "");
    const medicines = String(body.medicines || "").trim();
    const advice = String(body.advice || "");
    const encounterId = body.encounterId ? String(body.encounterId) : null;
    if (!patientId || !medicines) {
      return NextResponse.json({ success: false, error: "Patient and medicines required" }, { status: 400 });
    }
    const patientResult = await requireAuthorizedPatient(auth.ctx, patientId);
    if (!patientResult.ok) return patientResult.response;
    const patient = patientResult.patient;

    if (encounterId) {
      // Encounter has no clinicId field; facility scope is via Patient relation.
      // patientId was already authorized for this membership (requireAuthorizedPatient).
      const enc = await prisma.encounter.findFirst({
        where: {
          id: encounterId,
          patientId,
          patient: {
            OR: [
              { clinicId: auth.ctx.membership.clinicId },
              { clinicId: null, doctorId: auth.ctx.session.doctorId },
            ],
          },
        },
      });
      if (!enc) {
        return NextResponse.json({ success: false, error: "Encounter not found" }, { status: 404 });
      }
    }

    const rx = await prisma.prescription.create({
      data: {
        doctorId: auth.ctx.session.doctorId,
        patientId,
        patientName: patient.name,
        encounterId,
        medicines,
        advice,
      },
    });
    await writeAudit({
      doctorId: auth.ctx.session.doctorId,
      clinicId: auth.ctx.membership.clinicId,
      action: "create",
      entity: "Prescription",
      entityId: rx.id,
    });
    return NextResponse.json({ success: true, prescription: rx });
  } catch (e) {
    console.error("create rx", e instanceof Error ? e.message : "error");
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
