import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { getStorageProvider } from "@/lib/storage";
import { extractLabOcrDraft } from "@/lib/lab-ocr";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership?.clinicId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const doc = await prisma.medicalDocument.findFirst({
    where: { id, clinicId: membership.clinicId, deletedAt: null },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const provider = getStorageProvider();
  const obj = await provider.getObject(doc.storageKey);
  if (!obj) return NextResponse.json({ success: false, error: "Object missing" }, { status: 404 });

  const result = await extractLabOcrDraft(obj.data, doc.mimeType);
  const updated = await prisma.medicalDocument.update({
    where: { id: doc.id },
    data: {
      ocrStatus: result.status,
      ocrDraft: JSON.stringify({
        candidates: result.draft,
        rawTextPreview: result.rawTextPreview,
        message: result.message,
      }),
      ocrExtractedAt: new Date(),
    },
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "LAB_DOCUMENT_OCR",
    entity: "MedicalDocument",
    entityId: doc.id,
    meta: { status: result.status, candidateCount: Object.keys(result.draft).length },
  });

  return NextResponse.json({
    success: true,
    documentId: updated.id,
    ocrStatus: updated.ocrStatus,
    draft: result.draft,
    message: result.message,
  });
}
