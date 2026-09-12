import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password required" }, { status: 400 });
    }

    const doctor = await prisma.doctor.findUnique({ where: { email } });
    if (!doctor || !(await verifyPassword(password, doctor.passwordHash))) {
      return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
    }

    if (!doctor.isActive) {
      return NextResponse.json({ success: false, error: "This doctor account is deactivated. Contact a clinic administrator." }, { status: 403 });
    }

    await createSession({ doctorId: doctor.id, email: doctor.email });
    await writeAudit({
      doctorId: doctor.id,
      action: "login",
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
    console.error("login error", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
