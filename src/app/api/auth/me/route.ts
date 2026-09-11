import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, doctor: null }, { status: 401 });
    }
    const doctor = await prisma.doctor.findUnique({ where: { id: session.doctorId } });
    if (!doctor) {
      return NextResponse.json({ success: false, doctor: null }, { status: 401 });
    }
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
    console.error("me error", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
