import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isMedlumOwnerEmail } from "@/lib/owner";
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
    const contentLength = Number(req.headers.get("content-length") || "0");
    const maxBytes = 20 * 1024 * 1024;
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return NextResponse.json({ success: false, valid: false, errors: ["Migration package exceeds 20 MB."] }, { status: 413 });
    }
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > maxBytes) {
      return NextResponse.json({ success: false, valid: false, errors: ["Migration package exceeds 20 MB."] }, { status: 413 });
    }
    let body: unknown;
    try { body = JSON.parse(rawBody); }
    catch { return NextResponse.json({ success: false, valid: false, errors: ["Migration request must be valid JSON."] }, { status: 400 }); }
    const parsed = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const targetClinicId = typeof parsed.targetClinicId === "string" ? parsed.targetClinicId.trim() : "";
    const execute = parsed.execute === true;
    const pkg = parsed.package;

    if (!targetClinicId) {
      return NextResponse.json({ success: false, error: "Target facility is required" }, { status: 400 });
    }

    const result = await importClinicData(pkg, targetClinicId, session.email, { execute });

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
