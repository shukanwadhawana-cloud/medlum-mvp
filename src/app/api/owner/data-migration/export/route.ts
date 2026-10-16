import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { exportClinicData } from "@/lib/data-migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !isMedlumOwnerEmail(session.email)) {
    return NextResponse.json({ success: false, error: "Owner access required" }, { status: 403 });
  }
  const clinicId = req.nextUrl.searchParams.get("clinicId")?.trim();
  if (!clinicId) return NextResponse.json({ success: false, error: "clinicId is required" }, { status: 400 });

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } });
  if (!clinic) return NextResponse.json({ success: false, error: "Facility not found" }, { status: 404 });

  try {
    const pkg = await exportClinicData(clinicId, session.email);
    await prisma.auditLog.create({
      data: {
        doctorId: session.doctorId,
        action: "DATA_EXPORT",
        entity: "Clinic",
        entityId: clinicId,
        meta: JSON.stringify({ clinicName: clinic.name, schemaVersion: pkg.schemaVersion }),
      },
    });
    const body = JSON.stringify(pkg);
    const safeName = clinic.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "hospital";
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="medlum-${safeName}-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("owner data export failed", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ success: false, error: "Export could not be completed" }, { status: 500 });
  }
}
