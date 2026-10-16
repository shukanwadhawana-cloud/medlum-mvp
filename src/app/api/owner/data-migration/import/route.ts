import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { prisma } from "@/lib/db";
import { importClinicData } from "@/lib/data-migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !isMedlumOwnerEmail(session.email)) {
    return NextResponse.json({ success: false, error: "Owner access required" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const targetClinicId = typeof body?.targetClinicId === "string" ? body.targetClinicId : "";
    const execute = body?.execute === true;
    const pkg = body?.package;

    if (!targetClinicId) {
      return NextResponse.json({ success: false, error: "Target facility is required" }, { status: 400 });
    }

    const result = await importClinicData(pkg, targetClinicId, session.email, { execute });

    if (result.executed) {
      await prisma.auditLog.create({
        data: {
          action: "DATA_IMPORT",
          entity: "Clinic",
          entityId: targetClinicId,
          doctorId: session.doctorId,
          meta: JSON.stringify({
            schemaVersion: 1,
            imported: result.imported,
            deferred: result.deferred,
            ownerPreserved: result.ownerPreserved === true,
          }),
        },
      });
    }

    return NextResponse.json({
      success: result.valid,
      ...result,
      executeRequested: execute,
    }, {
      status: result.valid ? 200 : 422,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("owner data migration import failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({
      success: false,
      valid: false,
      errors: ["Migration request could not be completed."],
    }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
