import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patients = await prisma.patient.findMany({
    where: { doctorId: session.doctorId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    patients: patients.map((p) => ({
      id: p.id,
      doctorId: p.doctorId,
      name: p.name,
      age: p.age,
      gender: p.gender,
      phone: p.phone,
      bp: p.bp,
      allergies: p.allergies,
      notes: p.notes,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const age = parseInt(body.age, 10) || 0;
    const gender = String(body.gender || "Male");
    const phone = String(body.phone || "").trim();
    const bp = String(body.bp || "");
    const allergies = String(body.allergies || "");
    const notes = String(body.notes || "");

    if (!name || !phone) {
      return NextResponse.json({ success: false, error: "Name and phone required" }, { status: 400 });
    }

    const patient = await prisma.patient.create({
      data: {
        doctorId: session.doctorId,
        name,
        age,
        gender,
        phone,
        bp,
        allergies,
        notes,
      },
    });

    await writeAudit({
      doctorId: session.doctorId,
      action: "create",
      entity: "Patient",
      entityId: patient.id,
      meta: { name },
    });

    return NextResponse.json({
      success: true,
      patient: {
        id: patient.id,
        doctorId: patient.doctorId,
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        phone: patient.phone,
        bp: patient.bp,
        allergies: patient.allergies,
        notes: patient.notes,
        createdAt: patient.createdAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("create patient", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
