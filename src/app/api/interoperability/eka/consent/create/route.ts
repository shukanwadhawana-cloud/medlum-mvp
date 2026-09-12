import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createEkaConsent } from "@/lib/interoperability/eka-consent-adapter";

const purposes = ["Self Requested", "Care management", "Public Health", "Disease Specific Health Research"] as const;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const patient = body?.patient;
    const hiu = body?.hiu;
    const hipIdentifier = body?.hipIdentifier;
    const period = body?.period;
    const recordTypes = Array.isArray(body?.recordTypes) ? body.recordTypes.filter((x: unknown) => typeof x === "string") : [];
    const purpose = body?.purpose;

    if (!patient?.healthId || !patient?.oid || !hiu?.clinicId || !hiu?.doctorOid || !hipIdentifier?.id || !hipIdentifier?.name || !period?.from || !period?.to || !period?.expiry || !recordTypes.length || !purposes.includes(purpose)) {
      return NextResponse.json({ error: "Invalid consent request payload." }, { status: 400 });
    }

    const result = await createEkaConsent({
      appointmentId: typeof body.appointmentId === "string" ? body.appointmentId : undefined,
      careContexts: Array.isArray(body.careContexts) ? body.careContexts : [],
      hipIdentifier,
      hiu: {
        clinicId: hiu.clinicId,
        doctorOid: hiu.doctorOid,
        requester: {
          system: typeof hiu.requester?.system === "string" ? hiu.requester.system : "https://medlum.app",
          type: typeof hiu.requester?.type === "string" ? hiu.requester.type : "doctor",
          value: typeof hiu.requester?.value === "string" ? hiu.requester.value : session.doctorId,
          name: typeof hiu.requester?.name === "string" ? hiu.requester.name : "MedLum clinician",
        },
      },
      patient,
      period,
      purpose,
      recordTypes,
      partnerPtId: typeof body.partnerPtId === "string" ? body.partnerPtId : patient.oid,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
    return NextResponse.json({ success: true, consentInitId: result.data?.consentInitId ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to create ABDM consent request." }, { status: 502 });
  }
}
