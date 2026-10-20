import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { getStorageProvider } from "@/lib/storage";
import { extractLabOcrDraft } from "@/lib/lab-ocr";

export const runtime = "nodejs";

const RETRY_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Laboratory"]);

/** Re-run OCR on an existing FAILED document. Output remains a draft until human verification. */
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
  if (doc.ocrStatus !== "FAILED") {
    return NextResponse.json({ success: false, error: "Retry is available only when extraction status is FAILED." }, { status: 409 });
  }

  const provider = getStorageProvider();
  const stored = await provider.getObject(doc.storageKey);
  if (!stored) {
    return NextResponse.json({
      success: false,
      code: "ORIGINAL_FILE_UNAVAILABLE",
      error: "The original file is not available in durable storage. Re-upload the same report file to retry extraction; MedLum will reuse the existing document instead of creating a duplicate.",
    }, { status: 409 });
  }

  let assist;
  try {
    assist = await extractLabOcrDraft(stored.data, doc.mimeType || stored.mimeType);
  } catch {
    assist = {
      status: "FAILED" as const,
      draft: {},
      rawTextPreview: "",
      message: "Extraction retry failed. The report remains unverified; try a clearer copy or enter the result manually.",
      warnings: [],
    };
  }

  const ocrStatus = assist.status === "DRAFT" ? "DRAFT" : "FAILED";
  const updated = await prisma.medicalDocument.update({
    where: { id: doc.id },
    data: {
      ocrStatus,
      ocrDraft: JSON.stringify({
        candidates: assist.draft,
        rawTextPreview: assist.rawTextPreview,
        warnings: assist.warnings || [],
        machineExtracted: true,
        verified: false,
        retryAttemptedAt: new Date().toISOString(),
      }),
      ocrExtractedAt: new Date(),
    },
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "LAB_DOCUMENT_OCR_RETRY",
    entity: "MedicalDocument",
    entityId: doc.id,
    meta: { clinicId: membership.clinicId, labOrderId: doc.labOrderId, patientId: doc.patientId, ocrStatus },
  });

  return NextResponse.json({
    success: true,
    document: updated,
    ocr: { status: ocrStatus, message: assist.message, verified: false },
  });
}
