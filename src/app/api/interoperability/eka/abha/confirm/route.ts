import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getTenantPatient } from "@/lib/interoperability/abdm-tenant";
import { writeAudit } from "@/lib/audit";

/**
 * Confirm ABHA link for a tenant-scoped patient.
 * Server is source of truth: never trust browser claims of success without membership + patient ownership.
 * Does not persist OTP or provider tokens.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
    const abhaNumber = typeof body.abhaNumber === "string" ? body.abhaNumber.trim() : "";
    const abhaAddress = typeof body.abhaAddress === "string" ? body.abhaAddress.trim() : "";
    const txnId = typeof body.txnId === "string" ? body.txnId.trim() : "";
    const failed = body.status === "FAILED";

    if (!patientId) return NextResponse.json({ error: "patientId is required." }, { status: 400 });

    const patient = await getTenantPatient(patientId, session.doctorId);
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

    if (failed) {
      const updated = await prisma.patient.update({
        where: { id: patient.id },
        data: { abhaStatus: "FAILED", abhaTxnId: "" },
      });
      await writeAudit({
        doctorId: session.doctorId,
        action: "ABHA_LINK_FAILED",
        entity: "Patient",
        entityId: patient.id,
        meta: {},
      });
      return NextResponse.json({ success: true, abhaStatus: updated.abhaStatus });
    }

    if (!abhaNumber && !abhaAddress) {
      return NextResponse.json(
        { error: "abhaNumber or abhaAddress is required when linking." },
        { status: 400 }
      );
    }

    if (patient.abhaStatus === "PENDING" && patient.abhaTxnId) {
      if (!txnId || txnId !== patient.abhaTxnId) {
        return NextResponse.json(
          { error: "ABHA transaction mismatch or expired. Restart linking." },
          { status: 409 }
        );
      }
    }

    if (abhaNumber && patient.clinicId) {
      const clash = await prisma.patient.findFirst({
        where: {
          clinicId: patient.clinicId,
          abhaNumber,
          NOT: { id: patient.id },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json(
          { error: "This ABHA number is already linked to another patient in this clinic." },
          { status: 409 }
        );
      }
    }

    const now = new Date();
    const updated = await prisma.patient.update({
      where: { id: patient.id },
      data: {
        abhaNumber: abhaNumber || patient.abhaNumber,
        abhaAddress: abhaAddress || patient.abhaAddress,
        abhaStatus: "LINKED",
        abhaTxnId: "",
        abhaLinkedAt: now,
        abhaVerifiedAt: now,
      },
    });

    await writeAudit({
      doctorId: session.doctorId,
      action: "ABHA_LINKED",
      entity: "Patient",
      entityId: patient.id,
      meta: {
        abhaNumber: updated.abhaNumber ? "set" : "",
        abhaAddress: updated.abhaAddress ? "set" : "",
      },
    });

    return NextResponse.json(
      {
        success: true,
        patientId: updated.id,
        abhaStatus: updated.abhaStatus,
        abhaNumber: updated.abhaNumber,
        abhaAddress: updated.abhaAddress,
        abhaLinkedAt: updated.abhaLinkedAt,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("ABHA confirm failed", error instanceof Error ? error.message : "error");
    return NextResponse.json({ error: "Unable to confirm ABHA link." }, { status: 502 });
  }
}
