import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createEkaConsent } from "@/lib/interoperability/eka-consent-adapter";
import { getClinicMembership, getClinicWithHip, resolveHipId, getTenantPatient } from "@/lib/interoperability/abdm-tenant";
import { writeAudit } from "@/lib/audit";

const purposes = ["Self Requested", "Care management", "Public Health", "Disease Specific Health Research"] as const;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const membership = await getClinicMembership(session.doctorId);
    if (!membership?.clinicId) {
      return NextResponse.json({ error: "No active clinic membership." }, { status: 403 });
    }

    // Never trust client clinicId for tenancy — use membership.
    const clinic = await getClinicWithHip(membership.clinicId);
    if (!clinic) return NextResponse.json({ error: "Clinic not found." }, { status: 404 });

    const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
    const patient = patientId ? await getTenantPatient(patientId, session.doctorId) : null;
    if (!patient) return NextResponse.json({ error: "Patient not found in this clinic." }, { status: 404 });
    if (patient.abhaStatus !== "LINKED" && !patient.abhaNumber && !patient.abhaAddress) {
      return NextResponse.json({ error: "Patient ABHA must be linked before requesting consent." }, { status: 400 });
    }

    const period = body?.period;
    const recordTypes = Array.isArray(body?.recordTypes)
      ? body.recordTypes.filter((x: unknown) => typeof x === "string")
      : ["OPConsultation"];
    const purpose = purposes.includes(body?.purpose) ? body.purpose : "Care management";
    const hipId = resolveHipId(clinic.ekaHipId);
    if (!hipId) return NextResponse.json({ error: "Clinic EKA HIP is not configured." }, { status: 503 });

    const hipIdentifier = { id: hipId, name: clinic.name || "MedLum Clinic" };
    const hiu = {
      clinicId: clinic.id,
      doctorOid: session.doctorId,
      requester: {
        system: "https://medlum.app",
        type: "doctor",
        value: session.doctorId,
        name: "MedLum clinician",
      },
    };
    const patientPayload = {
      healthId: patient.abhaNumber || patient.abhaAddress || patient.id,
      oid: patient.id,
    };

    const periodFrom = period?.from ? new Date(period.from) : new Date();
    const periodTo = period?.to ? new Date(period.to) : new Date(Date.now() + 30 * 86400000);
    const periodExpiry = period?.expiry || periodTo.toISOString();

    const result = await createEkaConsent({
      appointmentId: typeof body.appointmentId === "string" ? body.appointmentId : undefined,
      careContexts: Array.isArray(body.careContexts) ? body.careContexts : [],
      hipIdentifier,
      hiu,
      patient: patientPayload,
      period: {
        from: periodFrom.toISOString(),
        to: periodTo.toISOString(),
        expiry: periodExpiry,
      },
      purpose,
      recordTypes,
      partnerPtId: patient.id,
    });

    if (!result.ok) {
      const failed = await prisma.abdmConsent.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          doctorId: session.doctorId,
          status: "FAILED",
          purpose,
          error: result.error || "EKA consent create failed",
          recordTypes: JSON.stringify(recordTypes),
          periodFrom,
          periodTo,
        },
      });
      return NextResponse.json({ error: result.error, consentId: failed.id, status: "FAILED" }, { status: 503 });
    }

    const consent = await prisma.abdmConsent.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        doctorId: session.doctorId,
        status: "REQUESTED",
        purpose,
        consentInitId: result.data?.consentInitId || "",
        recordTypes: JSON.stringify(recordTypes),
        careContextIds: JSON.stringify(body.careContexts || []),
        periodFrom,
        periodTo,
      },
    });

    await writeAudit({
      doctorId: session.doctorId,
      action: "abdm_consent_request",
      entity: "AbdmConsent",
      entityId: consent.id,
      meta: { status: "REQUESTED", consentInitId: consent.consentInitId ? "set" : "" },
    });

    return NextResponse.json(
      {
        success: true,
        consentId: consent.id,
        consentInitId: consent.consentInitId || null,
        status: consent.status,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Unable to create ABDM consent request." }, { status: 502 });
  }
}
