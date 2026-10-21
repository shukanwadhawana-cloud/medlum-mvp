import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

const RETRY_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Laboratory"]);

/**
 * Queue retry for the browser's on-device Clinical Assist engine. Never run
 * CPU-heavy OCR inside this serverless route: the deployed Vercel runtime has
 * shown missing Tesseract WASM assets and 300-second request timeouts.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership?.clinicId) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const role = normalizeClinicRole(membership.role);
  if (!RETRY_ROLES.has(role)) {
    return NextResponse.json({ success: false, error: "Not authorized to retry laboratory extraction." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const doc = await prisma.medicalDocument.findFirst({
    where: { id, clinicId: membership.clinicId, deletedAt: null },
  });
  if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
  if (!["FAILED", "PENDING"].includes(doc.ocrStatus)) {
    return NextResponse.json({
      success: false,
      error: "Retry is available only for pending or failed extraction. Verified reports are not modified.",
    }, { status: 409 });
  }

  const provider = getStorageProvider();
  const stored = await provider.getObject(doc.storageKey);
  if (!stored) {
    return NextResponse.json({
      success: false,
      code: "ORIGINAL_FILE_UNAVAILABLE",
      error: "The original file is not available in durable storage. Choose or re-upload the exact same report file; MedLum validates its checksum and reuses this report instead of creating a duplicate.",
    }, { status: 409 });
  }

  let priorDraft: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(doc.ocrDraft || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) priorDraft = parsed;
  } catch {
    // Preserve a safe draft envelope if an older row contains malformed JSON.
  }
  const retryAt = new Date();
  const updatedCount = await prisma.medicalDocument.updateMany({
    where: {
      id: doc.id,
      clinicId: membership.clinicId,
      deletedAt: null,
      ocrStatus: doc.ocrStatus,
      verifiedAt: null,
    },
    data: {
      ocrStatus: "PENDING",
      ocrDraft: JSON.stringify({
        ...priorDraft,
        machineExtracted: priorDraft.machineExtracted === true,
        verified: false,
        message: "The original report is available. Run Clinical Assist on this device to prepare an editable draft.",
        retryAttemptedAt: retryAt.toISOString(),
        extractionMethod: "clinical-assist-on-device",
      }),
      ocrExtractedAt: null,
    },
  });
  if (updatedCount.count !== 1) {
    return NextResponse.json({
      success: false,
      error: "This report changed while the retry was being queued. Reload it before continuing.",
    }, { status: 409 });
  }

  await writeAudit({
    doctorId: session.doctorId,
    action: "LAB_DOCUMENT_OCR_RETRY_QUEUED",
    entity: "MedicalDocument",
    entityId: doc.id,
    meta: {
      clinicId: membership.clinicId,
      labOrderId: doc.labOrderId,
      patientId: doc.patientId,
      previousStatus: doc.ocrStatus,
      ocrStatus: "PENDING",
      extractionMethod: "clinical-assist-on-device",
    },
  });

  const updated = await prisma.medicalDocument.findFirst({
    where: { id: doc.id, clinicId: membership.clinicId, deletedAt: null },
  });
  return NextResponse.json({
    success: true,
    document: updated,
    ocr: {
      status: "PENDING",
      verified: false,
      message: "The report is saved. Select it and run Clinical Assist in the browser; OCR will remain a draft until a clinician verifies it.",
    },
  });
}
