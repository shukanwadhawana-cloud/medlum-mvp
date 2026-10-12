import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { findAuthorizedPatient, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { canEnterDiagnosticReport, canOrderLabs } from "@/lib/permissions";
import { findOrthancStudyByUid, getPacsConfig } from "@/lib/pacs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DICOM_BYTES = 32 * 1024 * 1024;

function newId() {
  return `img_${randomBytes(12).toString("hex")}`;
}

function orthancAuthorization(): string | undefined {
  const username = process.env.PACS_ORTHANC_USERNAME;
  const password = process.env.PACS_ORTHANC_PASSWORD;
  if (!username || !password) return undefined;
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function normalizeId(value: string): string {
  return String(value || "").trim().toUpperCase();
}

/**
 * Import one DICOM instance into the configured Orthanc server and link the
 * resulting study to an authorized MedLum patient/order. A browser never
 * supplies an Orthanc ID or controls AVAILABLE status.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  if (!canOrderLabs(membership.role) && !canEnterDiagnosticReport(membership.role)) {
    return NextResponse.json({ error: "Insufficient role permissions", code: "RBAC_DENIED" }, { status: 403 });
  }

  const pacs = getPacsConfig();
  if (!pacs.enabled || !pacs.orthancBaseUrl) {
    return NextResponse.json(
      {
        error: "PACS is not configured. No file was uploaded. Configure a secured Orthanc endpoint first.",
        code: "PACS_UNAVAILABLE",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  const patientId = String(form.get("patientId") || "").trim();
  const diagnosticOrderId = String(form.get("diagnosticOrderId") || "").trim();
  if (!(file instanceof File) || !patientId || !diagnosticOrderId) {
    return NextResponse.json(
      {
        error: "DICOM file, patientId, and diagnosticOrderId are required",
        code: "IMPORT_FIELDS_REQUIRED",
      },
      { status: 400 }
    );
  }
  if (file.size <= 0 || file.size > MAX_DICOM_BYTES) {
    return NextResponse.json(
      { error: "DICOM file must be between 1 byte and 32 MiB", code: "FILE_SIZE_INVALID" },
      { status: 413 }
    );
  }

  const patient = await findAuthorizedPatient(membership, patientId);
  if (!patient) return NextResponse.json({ error: "Patient not found", code: "PATIENT_NOT_FOUND" }, { status: 404 });

  const members = await prisma.clinicMember.findMany({
    where: { clinicId: membership.clinicId, isActive: true },
    select: { doctorId: true },
  });
  const doctorIds = Array.from(new Set([session.doctorId, ...members.map((member) => member.doctorId)]));
  const order = await prisma.diagnosticOrder.findFirst({
    where: {
      id: diagnosticOrderId,
      patientId: patient.id,
      patient: {
        OR: [{ clinicId: membership.clinicId }, { clinicId: null, doctorId: { in: doctorIds } }],
      },
    },
    select: { id: true, patientId: true, status: true },
  });
  if (!order) {
    return NextResponse.json(
      { error: "Diagnostic order does not belong to this patient or clinic", code: "ORDER_PATIENT_MISMATCH" },
      { status: 404 }
    );
  }
  if (String(order.status || "").toLowerCase() === "cancelled") {
    return NextResponse.json(
      { error: "Cannot import imaging for a cancelled diagnostic order", code: "ORDER_CANCELLED" },
      { status: 409 }
    );
  }

  const auth = orthancAuthorization();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/dicom",
  };
  if (auth) headers.Authorization = auth;

  const dicomBytes = Buffer.from(await file.arrayBuffer());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  let orthancResult: { ID?: string; ParentStudy?: string; Status?: string };
  try {
    // Orthanc expects the DICOM object as the raw request body, not multipart form fields.
    const response = await fetch(`${pacs.orthancBaseUrl}/instances`, {
      method: "POST",
      headers,
      body: dicomBytes,
      signal: controller.signal,
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({ error: "PACS server authentication failed", code: "PACS_AUTH_FAILED" }, { status: 502 });
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: "Orthanc rejected the DICOM upload", code: "DICOM_REJECTED", upstreamStatus: response.status },
        { status: 422 }
      );
    }
    orthancResult = await response.json();
    if (!orthancResult.ID || orthancResult.Status === "Failure") {
      return NextResponse.json(
        { error: "Orthanc did not accept a valid DICOM instance", code: "DICOM_REJECTED" },
        { status: 422 }
      );
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut ? "PACS upload timed out" : "PACS server is unreachable",
        code: timedOut ? "PACS_TIMEOUT" : "PACS_UNREACHABLE",
      },
      { status: 503 }
    );
  } finally {
    clearTimeout(timeout);
  }

  const parentStudy = String(orthancResult.ParentStudy || "").trim();
  if (!parentStudy) {
    return NextResponse.json(
      { error: "Orthanc accepted the instance but did not return a parent study", code: "STUDY_METADATA_UNAVAILABLE" },
      { status: 503 }
    );
  }

  let metadataResponse: Response;
  try {
    metadataResponse = await fetch(`${pacs.orthancBaseUrl}/studies/${encodeURIComponent(parentStudy)}`, {
      headers: auth ? { Authorization: auth, Accept: "application/json" } : { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "DICOM was accepted by Orthanc, but study metadata could not be verified. Retry verification before importing again.",
        code: "STUDY_METADATA_UNAVAILABLE",
      },
      { status: 503 }
    );
  }
  if (!metadataResponse.ok) {
    return NextResponse.json(
      { error: "DICOM was accepted but Orthanc study metadata is unavailable", code: "STUDY_METADATA_UNAVAILABLE" },
      { status: 503 }
    );
  }
  const metadata = (await metadataResponse.json()) as {
    ID?: string;
    MainDicomTags?: {
      StudyInstanceUID?: string;
      StudyDate?: string;
      ModalitiesInStudy?: string;
      StudyDescription?: string;
      AccessionNumber?: string;
    };
    PatientMainDicomTags?: { PatientID?: string };
  };
  const uid = String(metadata.MainDicomTags?.StudyInstanceUID || "").trim();
  if (!uid || uid.length > 64 || !/^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*))*$/.test(uid)) {
    return NextResponse.json(
      { error: "Orthanc returned invalid study metadata; study was not linked", code: "INVALID_ORTHANC_UID" },
      { status: 422 }
    );
  }

  const verified = await findOrthancStudyByUid(uid, pacs);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.message, code: verified.code }, { status: 422 });
  }

  // Identity policy (no name matching):
  // - If MedLum has UHID and/or registrationNo and DICOM PatientID is present, require a match.
  // - If DICOM PatientID is missing, or MedLum has neither identifier, allow authorized clinician
  //   link with an audited IDENTITY_UNVERIFIED note (patient+order already authorization-checked).
  // - Explicit mismatches are always rejected.
  const dicomPatientId = normalizeId(String(metadata.PatientMainDicomTags?.PatientID || ""));
  const identityRows = await prisma.$queryRaw<{ uhid: string; registrationNo: string }[]>`
    SELECT uhid, "registrationNo" FROM "Patient"
    WHERE id = ${patient.id}
      AND ("clinicId" = ${membership.clinicId} OR "clinicId" IS NULL)
    LIMIT 1
  `;
  const identity = identityRows[0];
  const uhid = normalizeId(identity?.uhid || "");
  const registrationNo = normalizeId(identity?.registrationNo || "");
  const hasMedlumIds = Boolean(uhid || registrationNo);
  let identityMode: "matched" | "unverified_empty" | "unverified_no_medlum_id" = "matched";

  if (dicomPatientId && hasMedlumIds) {
    const matched = (uhid && dicomPatientId === uhid) || (registrationNo && dicomPatientId === registrationNo);
    if (!matched) {
      await writeAudit({
        doctorId: session.doctorId,
        clinicId: membership.clinicId,
        action: "import_identity_rejected",
        entity: "ImagingStudy",
        entityId: uid,
        meta: { patientId: patient.id, diagnosticOrderId: order.id, code: "DICOM_PATIENT_ID_MISMATCH" },
      });
      return NextResponse.json(
        {
          error:
            "DICOM PatientID does not match this patient's MedLum UHID or registration number. The study was not linked.",
          code: "DICOM_PATIENT_ID_MISMATCH",
        },
        { status: 409 }
      );
    }
  } else if (!dicomPatientId) {
    identityMode = "unverified_empty";
  } else {
    identityMode = "unverified_no_medlum_id";
  }

  const modality =
    String(metadata.MainDicomTags?.ModalitiesInStudy || "OT")
      .split("\\")[0]
      .slice(0, 16) || "OT";
  const description = String(metadata.MainDicomTags?.StudyDescription || "Imported DICOM study").slice(0, 512);
  const accessionNumber = String(metadata.MainDicomTags?.AccessionNumber || "").slice(0, 64);
  const rawDate = String(metadata.MainDicomTags?.StudyDate || "");
  const studyDate = /^\d{8}$/.test(rawDate)
    ? new Date(Date.UTC(Number(rawDate.slice(0, 4)), Number(rawDate.slice(4, 6)) - 1, Number(rawDate.slice(6, 8))))
    : null;
  const id = newId();

  // Idempotent: same clinic+UID keeps existing patient binding; never reassign patient/order conflict.
  await prisma.$executeRaw`
    INSERT INTO "ImagingStudy" (
      id, "clinicId", "patientId", "diagnosticOrderId", "studyInstanceUid",
      "accessionNumber", modality, description, "studyDate", "orthancId",
      status, "createdByDoctorId", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${membership.clinicId}, ${patient.id}, ${order.id}, ${uid},
      ${accessionNumber}, ${modality}, ${description}, ${studyDate}, ${verified.match.orthancId},
      'AVAILABLE', ${session.doctorId}, NOW(), NOW()
    )
    ON CONFLICT ("clinicId", "studyInstanceUid") DO UPDATE SET
      "diagnosticOrderId" = COALESCE("ImagingStudy"."diagnosticOrderId", EXCLUDED."diagnosticOrderId"),
      "orthancId" = EXCLUDED."orthancId",
      status = 'AVAILABLE',
      modality = EXCLUDED.modality,
      description = EXCLUDED.description,
      "accessionNumber" = EXCLUDED."accessionNumber",
      "studyDate" = COALESCE(EXCLUDED."studyDate", "ImagingStudy"."studyDate"),
      "updatedAt" = NOW()
    WHERE "ImagingStudy"."patientId" = EXCLUDED."patientId"
      AND (
        "ImagingStudy"."diagnosticOrderId" IS NULL
        OR "ImagingStudy"."diagnosticOrderId" = EXCLUDED."diagnosticOrderId"
      )
  `;

  const linkedRows = await prisma.$queryRaw<
    { id: string; patientId: string; diagnosticOrderId: string | null; status: string }[]
  >`
    SELECT id, "patientId", "diagnosticOrderId", status
    FROM "ImagingStudy"
    WHERE "clinicId" = ${membership.clinicId} AND "studyInstanceUid" = ${uid}
    LIMIT 1
  `;
  const linked = linkedRows[0];
  if (!linked || linked.patientId !== patient.id || linked.diagnosticOrderId !== order.id || linked.status !== "AVAILABLE") {
    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: "import_link_failed",
      entity: "ImagingStudy",
      entityId: uid,
      meta: { patientId: patient.id, diagnosticOrderId: order.id, code: "LINK_CONFLICT" },
    });
    return NextResponse.json(
      {
        error:
          "The DICOM exists in Orthanc but could not be safely linked because this study is already associated with a different patient or order.",
        code: "LINK_CONFLICT",
      },
      { status: 409 }
    );
  }

  await writeAudit({
    doctorId: session.doctorId,
    clinicId: membership.clinicId,
    action: "import_link_verify",
    entity: "ImagingStudy",
    entityId: linked.id,
    meta: { patientId: patient.id, diagnosticOrderId: order.id, modality, identityMode },
  });

  return NextResponse.json(
    {
      success: true,
      study: {
        id: linked.id,
        patientId: linked.patientId,
        diagnosticOrderId: linked.diagnosticOrderId,
        studyInstanceUid: uid,
        modality,
        description,
        status: "AVAILABLE",
      },
      identityMode,
      note:
        "One DICOM instance was imported. Additional instances for the same StudyInstanceUID can be uploaded; they remain the same study record.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
