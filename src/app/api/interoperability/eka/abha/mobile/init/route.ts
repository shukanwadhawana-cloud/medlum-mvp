import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createAbhaMobileRegistration } from "@/lib/interoperability/eka-adapter";
import { getTenantPatient } from "@/lib/interoperability/abdm-tenant";
import { writeAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
    if (!patientId) return NextResponse.json({ error: "patientId is required." }, { status: 400 });

    const patient = await getTenantPatient(patientId, session.doctorId);
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    if (!patient.phone) return NextResponse.json({ error: "Patient mobile number is required." }, { status: 400 });

    const result = await createAbhaMobileRegistration({
      mobileNumber: patient.phone,
      partnerPtId: patient.id,
    });

    if (!result.ok) {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { abhaStatus: "FAILED", abhaTxnId: "" },
      });
      return NextResponse.json({ error: result.error }, { status: 503 });
    }

    const txnId = result.data?.txnId || "";
    await prisma.patient.update({
      where: { id: patient.id },
      data: { abhaStatus: "PENDING", abhaTxnId: txnId },
    });
    await writeAudit({
      doctorId: session.doctorId,
      action: "abha_init",
      entity: "Patient",
      entityId: patient.id,
      meta: { txnId, status: "PENDING" },
    });

    return NextResponse.json(
      {
        success: true,
        patientId: patient.id,
        txnId,
        hint: result.data?.hint ?? null,
        abhaStatus: "PENDING",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Eka ABHA mobile init failed", error);
    return NextResponse.json({ error: "Eka ABHA registration could not be started." }, { status: 502 });
  }
}
