export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { prisma } from "@/lib/db";
import { getSmtpConfigSanitized, verifyOtpSmtpTransport } from "@/lib/otp";

/**
 * Owner-only SMTP diagnostic. Never returns secrets or OTP codes.
 * GET /api/owner/smtp-status?verify=1  — also runs transporter.verify()
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const doctor = await prisma.doctor.findUnique({
    where: { id: session.doctorId },
    select: { email: true, isActive: true },
  });
  if (!doctor?.isActive || !isMedlumOwnerEmail(doctor.email)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const doVerify = url.searchParams.get("verify") === "1";
  const config = getSmtpConfigSanitized();

  if (!doVerify) {
    return NextResponse.json({
      success: true,
      config,
      note: "Add ?verify=1 to run transporter.verify() against the live SMTP path.",
    });
  }

  const result = await verifyOtpSmtpTransport();
  return NextResponse.json({
    success: result.ok,
    code: result.code,
    message: result.message,
    config: result.config,
  });
}
