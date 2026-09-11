import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await prisma.prescription.findMany({
    where: { doctorId: session.doctorId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    prescriptions: list.map((r) => ({
      id: r.id,
      doctorId: r.doctorId,
      patientId: r.patientId,
      patientName: r.patientName,
      medicines: r.medicines,
      advice: r.advice,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const patientId = String(body.patientId || "");
    const medicines = String(body.medicines || "").trim();
    const advice = String(body.advice || "");
    if (!patientId || !medicines) {
      return NextResponse.json({ success: false, error: "Patient and medicines required" }, { status: 400 });
    }

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, doctorId: session.doctorId },
    });
    if (!patient) {
      return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    }

    const rx = await prisma.prescription.create({
      data: {
        doctorId: session.doctorId,
        patientId,
        patientName: patient.name,
        medicines,
        advice,
      },
    });

    await writeAudit({
      doctorId: session.doctorId,
      action: "create",
      entity: "Prescription",
      entityId: rx.id,
    });

    return NextResponse.json({
      success: true,
      prescription: {
        id: rx.id,
        doctorId: rx.doctorId,
        patientId: rx.patientId,
        patientName: rx.patientName,
        medicines: rx.medicines,
        advice: rx.advice,
        createdAt: rx.createdAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("create rx", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
