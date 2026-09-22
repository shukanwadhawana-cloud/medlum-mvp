import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { getStorageProvider } from "@/lib/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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
  if (provider.getSignedUrl && doc.storageProvider === "r2") {
    try {
      const url = await provider.getSignedUrl(doc.storageKey, 120);
      if (url) {
        return NextResponse.json({
          success: true,
          mode: "signed",
          url,
          expiresInSeconds: 120,
          mimeType: doc.mimeType,
          fileName: doc.originalFileName,
        });
      }
    } catch {
      /* fall through */
    }
  }

  const obj = await provider.getObject(doc.storageKey);
  if (!obj) return NextResponse.json({ error: "Object missing" }, { status: 404 });

  return new NextResponse(new Uint8Array(obj.data), {
    status: 200,
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${doc.originalFileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
