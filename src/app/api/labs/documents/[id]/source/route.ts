import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

const REPORT_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO", "Laboratory"]);

/** Streams the original report to the same authenticated clinic so Clinical Assist can OCR locally. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership?.clinicId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!REPORT_ROLES.has(normalizeClinicRole(membership.role))) {
    return NextResponse.json({ error: "Not authorized to read laboratory reports." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const doc = await prisma.medicalDocument.findFirst({
    where: { id, clinicId: membership.clinicId, deletedAt: null },
    select: { id: true, storageKey: true, mimeType: true, originalFileName: true },
  });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const stored = await getStorageProvider().getObject(doc.storageKey);
  if (!stored) {
    return NextResponse.json({ error: "The original report is unavailable in storage. Re-upload the same file to continue." }, { status: 404 });
  }

  const safeName = (doc.originalFileName || "lab-report").replace(/[\r\n"]/g, "_").slice(0, 180);
  return new NextResponse(new Uint8Array(stored.data), {
    status: 200,
    headers: {
      "Content-Type": doc.mimeType || stored.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
