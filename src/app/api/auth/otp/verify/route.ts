import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { consumeLoginOtp } from "@/lib/otp";
import { AUTH_LIMITS, authBucketKey, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeClinicRole } from "@/lib/workflow";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const doctorId = String(body.doctorId || "");
    const challengeId = String(body.challengeId || "");
    const code = String(body.code || "").trim();

    if (!doctorId || !challengeId || !code) {
      return NextResponse.json(
        { success: false, error: "doctorId, challengeId, and code are required." },
        { status: 400 }
      );
    }

    const rl = await consumeRateLimit(
      authBucketKey("otp-verify", req, doctorId),
      AUTH_LIMITS.login.limit,
      AUTH_LIMITS.login.windowMs
    );
    if (!rl.allowed) {
      const { body: b, headers } = rateLimitResponse(rl.retryAfterSec);
      return NextResponse.json(b, { status: 429, headers });
    }

    const result = await consumeLoginOtp({ doctorId, challengeId, code });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 401 });
    }

    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor || !doctor.isActive) {
      return NextResponse.json({ success: false, error: "Account unavailable." }, { status: 403 });
    }

    const membership = await prisma.clinicMember.findFirst({
      where: { doctorId: doctor.id, isActive: true },
      select: { role: true },
      orderBy: { createdAt: "asc" },
    });

    await createSession({ doctorId: doctor.id, email: doctor.email });
    await writeAudit({
      doctorId: doctor.id,
      action: "login",
      entity: "Doctor",
      entityId: doctor.id,
      meta: { via: "otp", primaryRole: normalizeClinicRole(membership?.role) },
    });

    return NextResponse.json({
      success: true,
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        clinicName: doctor.clinicName,
        phone: doctor.phone,
        createdAt: doctor.createdAt.toISOString(),
        primaryRole: normalizeClinicRole(membership?.role),
      },
    });
  } catch (e) {
    console.error("otp verify", e instanceof Error ? e.message : "error");
    return NextResponse.json({ success: false, error: "Unable to verify code." }, { status: 500 });
  }
}
