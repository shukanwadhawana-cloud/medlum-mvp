import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { ensurePrimaryClinic } from "@/lib/ensure-clinic";
import { isPublicSignupAllowed } from "@/lib/auth-config";
import { AUTH_LIMITS, authBucketKey, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const invite =
      String(body.inviteCode || body.invite || "").trim() ||
      req.headers.get("x-medlum-invite")?.trim() ||
      null;

    const gate = isPublicSignupAllowed(invite);
    if (!gate.allowed) {
      return NextResponse.json({ success: false, error: gate.reason }, { status: 403 });
    }

    const email = String(body.email || "").toLowerCase().trim();
    const rl = await consumeRateLimit(
      authBucketKey("signup", req, email || "unknown"),
      AUTH_LIMITS.signup.limit,
      AUTH_LIMITS.signup.windowMs
    );
    if (!rl.allowed) {
      const { body: b, headers } = rateLimitResponse(rl.retryAfterSec);
      return NextResponse.json(b, { status: 429, headers });
    }

    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    const clinicName = String(body.clinicName || "").trim();
    const phone = String(body.phone || "").trim();

    if (!name || !email || !password || !clinicName || !phone) {
      return NextResponse.json({ success: false, error: "All fields are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ success: false, error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const existing = await prisma.doctor.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ success: false, error: "Unable to create account with those details" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const doctor = await prisma.doctor.create({
      data: { name, email, passwordHash, clinicName, phone },
    });
    await ensurePrimaryClinic(doctor.id, clinicName);
    await createSession({ doctorId: doctor.id, email: doctor.email });
    await writeAudit({
      doctorId: doctor.id,
      action: "signup",
      entity: "Doctor",
      entityId: doctor.id,
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
      },
    });
  } catch (e) {
    console.error("signup error", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
