import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { ensurePrimaryClinic } from "@/lib/ensure-clinic";
import { isMedlumOwnerEmail } from "@/lib/owner";
import { AUTH_LIMITS, authBucketKey, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password required" }, { status: 400 });
    }

    const rl = await consumeRateLimit(
      authBucketKey("login", req, email),
      AUTH_LIMITS.login.limit,
      AUTH_LIMITS.login.windowMs
    );
    if (!rl.allowed) {
      const { body: b, headers } = rateLimitResponse(rl.retryAfterSec);
      return NextResponse.json(b, { status: 429, headers });
    }

    const doctor = await prisma.doctor.findUnique({ where: { email } });
    if (!doctor || !(await verifyPassword(password, doctor.passwordHash))) {
      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }

    if (!doctor.isActive) {
      return NextResponse.json(
        { success: false, error: "This account is deactivated. Contact MedLum support." },
        { status: 403 }
      );
    }

    const isOwner = isMedlumOwnerEmail(doctor.email);

    if (!isOwner) {
      await ensurePrimaryClinic(doctor.id, doctor.clinicName);
    }

    await createSession({ doctorId: doctor.id, email: doctor.email });
    await writeAudit({
      doctorId: doctor.id,
      action: "login",
      entity: isOwner ? "PlatformOwner" : "Doctor",
      entityId: doctor.id,
      meta: { isOwner },
    });

    return NextResponse.json({
      success: true,
      isOwner,
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        clinicName: isOwner ? "MedLum Platform" : doctor.clinicName,
        phone: doctor.phone,
        createdAt: doctor.createdAt.toISOString(),
        isOwner,
        primaryRole: isOwner ? "Owner" : undefined,
      },
    });
  } catch (e) {
    console.error("login error", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
