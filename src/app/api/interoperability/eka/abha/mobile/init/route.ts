import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ekaConfigured, ekaInitMobileRegistration } from "@/lib/interoperability/eka";

async function getAuthorizedPatient(patientId: string, doctorId: string) {
  const membership = await prisma.clinicMember.findFirst({
    where: { doctorId },
    select: { clinicId: true },
    orderBy: { createdAt: "asc" },
  });

  return prisma.patient.findFirst({
    where: membership?.clinicId
      ? { id: patientId, clinicId: membership.clinicId }
      : { id: patientId, doctorId },
    select: { id: true, phone: true },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!ekaConfigured()) {
    return NextResponse.json({
      error: "Eka ABDM integration is not configured on the server yet.",
      required: ["EKA_CLIENT_ID", "EKA_CLIENT_SECRET", "EKA_API_KEY", "EKA_PT_ID", "EKA_HIP_ID"],
    }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
    if (!patientId) return NextResponse.json({ error: "patientId is required." }, { status: 400 });

    const patient = await getAuthorizedPatient(patientId, session.doctorId);
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    if (!patient.phone) return NextResponse.json({ error: "Patient mobile number is required." }, { status: 400 });

    const result = await ekaInitMobileRegistration({
      mobileNumber: patient.phone,
      ptId: process.env.EKA_PT_ID!,
      partnerPtId: patient.id,
      hipId: process.env.EKA_HIP_ID!,
    });

    // Never persist OTPs or raw Eka tokens. The transaction ID is returned so
    // the next explicit user action can verify the OTP with Eka.
    return NextResponse.json({
      success: true,
      patientId: patient.id,
      txnId: result.txn_id,
      hint: result.hint ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Eka ABHA mobile init failed", error);
    return NextResponse.json({ error: "Eka ABHA registration could not be started." }, { status: 502 });
  }
}
