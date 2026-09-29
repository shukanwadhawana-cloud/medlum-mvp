import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { validateMigrationPackage } from "@/lib/data-migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !isMedlumOwnerEmail(session.email)) {
    return NextResponse.json({ success: false, error: "Owner access required" }, { status: 403 });
  }
  try {
    const pkg = await req.json();
    const validation = validateMigrationPackage(pkg);
    return NextResponse.json({
      success: validation.valid,
      valid: validation.valid,
      errors: validation.errors,
      sizeBytes: validation.sizeBytes,
      message: validation.valid
        ? "Migration package is structurally valid. Import execution requires an explicit migration target and will preserve the existing MedLum Master Owner."
        : "Migration package needs correction before import.",
    }, { status: validation.valid ? 200 : 422, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ success: false, valid: false, errors: ["Invalid JSON import package"] }, { status: 400 });
  }
}
