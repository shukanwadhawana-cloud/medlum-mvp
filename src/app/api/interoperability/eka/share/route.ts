import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { toFhirEncounter, toFhirMedicationRequest, toFhirPatient } from "@/lib/interoperability/fhir";
import { linkEkaCareContexts } from "@/lib/interoperability/eka-care-context-adapter";

async function getClinicId(doctorId: string) {
  const membership = await prisma.clinicMember.findFirst({ where: { doctorId }, select: { clinicId: true } });
  return membership?.clinicId || null;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    patientId?: string;
    encounterId?: string;
    abhaAddress?: string;
    oid?: string;
    partnerUserId?: string;
  } | null;

  if (!body?.patientId || !body.abhaAddress || !body.oid || !body.partnerUserId) {
    return NextResponse.json({ error: "patientId, abhaAddress, oid and partnerUserId are required." }, { status: 400 });
  }

  const clinicId = await getClinicId(session.doctorId);
  const patient = await prisma.patient.findFirst({
    where: clinicId ? { id: body.patientId, OR: [{ clinicId }, { doctorId: session.doctorId }] } : { id: body.patientId, doctorId: session.doctorId },
  });
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  const encounter = body.encounterId
    ? await prisma.encounter.findFirst({ where: { id: body.encounterId, patientId: patient.id } })
    : await prisma.encounter.findFirst({ where: { patientId: patient.id }, orderBy: { createdAt: "desc" } });

  if (!encounter) return NextResponse.json({ error: "No encounter is available to share." }, { status: 400 });

  const prescription = await prisma.prescription.findFirst({ where: { patientId: patient.id, encounterId: encounter.id }, orderBy: { createdAt: "desc" } });

  const resources = [
    toFhirPatient({ id: patient.id, name: patient.name, gender: patient.gender, phone: patient.phone }),
    toFhirEncounter({
      id: encounter.id,
      patientId: patient.id,
      doctorId: encounter.doctorId,
      date: encounter.date,
      chiefComplaint: encounter.chiefComplaint,
      diagnosis: encounter.diagnosis,
      assessment: encounter.assessment,
      plan: encounter.plan,
    }),
    ...(prescription ? [toFhirMedicationRequest({
      id: prescription.id,
      patientId: patient.id,
      encounterId: encounter.id,
      medicines: prescription.medicines,
      advice: prescription.advice,
      authoredOn: prescription.createdAt.toISOString(),
    })] : []),
  ];

  const fhirBundle = { resourceType: "Bundle", type: "collection", entry: resources.map((resource) => ({ resource })) };
  const encodedData = Buffer.from(JSON.stringify(fhirBundle), "utf8").toString("base64");

  const result = await linkEkaCareContexts({
    abhaAddress: body.abhaAddress,
    oid: body.oid,
    partnerUserId: body.partnerUserId,
    careContexts: [{
      careContextId: encounter.id,
      display: `MedLum consultation ${encounter.date}`,
      hiTypes: ["OPConsultation", ...(prescription ? ["Prescription"] : [])],
      data: encodedData,
    }],
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json({
    provider: result.provider,
    patientId: patient.id,
    encounterId: encounter.id,
    careContextId: encounter.id,
    resourceCount: resources.length,
    status: "submitted",
  }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
