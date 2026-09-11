import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").toLowerCase().trim();
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
      return NextResponse.json({ success: false, error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const doctor = await prisma.doctor.create({
      data: { name, email, passwordHash, clinicName, phone },
    });

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
