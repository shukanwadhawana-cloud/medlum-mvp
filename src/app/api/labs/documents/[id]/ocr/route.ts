import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { prisma } from "@/lib/db";

/**
 * Server-side OCR is deliberately disabled. Production Vercel logs showed
 * missing tesseract-core WASM files and 300-second function timeouts. The
 * report panel runs the same checksum-bound Clinical Assist OCR in the browser.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership?.clinicId) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const doc = await prisma.medicalDocument.findFirst({
    where: { id, clinicId: membership.clinicId, deletedAt: null },
    select: { id: true, ocrStatus: true },
  });
  if (!doc) return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
  if (["VERIFIED", "REJECTED"].includes(doc.ocrStatus)) {
    return NextResponse.json({ success: false, error: "This report is already finalized and cannot be reprocessed." }, { status: 409 });
  }

  return NextResponse.json({
    success: false,
    code: "CLIENT_EXTRACTION_REQUIRED",
    error: "Server-side OCR is disabled in this runtime because its OCR worker assets are not reliably available. Open the saved report in the lab panel and choose Extract with Clinical Assist; the on-device result remains an unverified draft.",
  }, { status: 409 });
}
