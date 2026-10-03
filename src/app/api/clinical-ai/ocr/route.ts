import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { canAccessModule } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) {
    return NextResponse.json({ success: false, error: "No active clinic membership" }, { status: 403 });
  }

  const role = normalizeClinicRole(membership.role);
  if (!canAccessModule(role, "clinical_assist")) {
    return NextResponse.json(
      { success: false, error: "Your role cannot use clinical documentation assist." },
      { status: 403 }
    );
  }

  // OCR is intentionally device-local. The Clinical Assist UI uses Tesseract.js
  // and PDF.js in the browser, so clinical documents are not sent to Railway,
  // PaddleOCR, or another hosted OCR endpoint.
  return NextResponse.json(
    {
      success: false,
      code: "OCR_DEVICE_LOCAL",
      error: "Clinical Assist OCR runs locally on the device. Upload the document through the Clinical Assist scanner.",
    },
    { status: 410 }
  );
}
