import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTenantPatient } from "@/lib/interoperability/abdm-tenant";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patientId = new URL(req.url).searchParams.get("patientId") || "";
  if (!patientId) return NextResponse.json({ error: "patientId is required." }, { status: 400 });

  const patient = await getTenantPatient(patientId, session.doctorId);
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  const consents = await prisma.abdmConsent.findMany({
    where: { patientId: patient.id, clinicId: patient.clinicId || undefined },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, status: true, purpose: true, consentInitId: true, createdAt: true, updatedAt: true },
  });
  const careContexts = await prisma.abdmCareContext.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, sourceType: true, sourceId: true, displayName: true, linkStatus: true, linkedAt: true },
  });

  return NextResponse.json(
    {
      patientId: patient.id,
      abhaNumber: patient.abhaNumber,
      abhaAddress: patient.abhaAddress,
      abhaStatus: patient.abhaStatus,
      abhaTxnId: patient.abhaTxnId ? "present" : "",
      abhaLinkedAt: patient.abhaLinkedAt,
      abhaVerifiedAt: patient.abhaVerifiedAt,
      consents,
      careContexts,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
