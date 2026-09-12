import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

const SLOT_MINUTES = 30;
const OPEN_HOUR = 9;
const CLOSE_HOUR = 18;
const BOOKING_STATUSES = ["Requested", "Scheduled", "Confirmed", "Waiting", "In Treatment"];

function slotsForDay() {
  const slots: string[] = [];
  for (let minutes = OPEN_HOUR * 60; minutes < CLOSE_HOUR * 60; minutes += SLOT_MINUTES) {
    const h = Math.floor(minutes / 60).toString().padStart(2, "0");
    const m = (minutes % 60).toString().padStart(2, "0");
    slots.push(`${h}:${m}`);
  }
  return slots;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get("clinicId") || "";
    const doctorId = searchParams.get("doctorId") || "";
    const date = searchParams.get("date") || "";

    const clinics = await prisma.clinic.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    if (!clinicId) {
      return NextResponse.json({ clinics, doctors: [], slots: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const members = await prisma.clinicMember.findMany({
      where: { clinicId },
      include: { doctor: { select: { id: true, name: true, clinicName: true } } },
      orderBy: { createdAt: "asc" },
    });

    const doctors = members
      .filter((m) => ["Owner", "Admin", "Consultant"].includes(m.role))
      .map((m) => ({ id: m.doctor.id, name: m.doctor.name, clinicName: m.doctor.clinicName, role: m.role }));

    if (!doctorId || !validDate(date)) {
      return NextResponse.json({ clinics, doctors, slots: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const member = members.find((m) => m.doctorId === doctorId);
    if (!member || !["Owner", "Admin", "Consultant"].includes(member.role)) {
      return NextResponse.json({ error: "Doctor is not available at this clinic." }, { status: 400 });
    }

    const appointments = await prisma.appointment.findMany({
      where: { doctorId, date, status: { in: BOOKING_STATUSES } },
      select: { time: true },
    });
    const booked = new Set(appointments.map((a) => a.time));
    const slots = slotsForDay().map((time) => ({ time, available: !booked.has(time) }));

    return NextResponse.json({ clinics, doctors, slots }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("public booking get", e);
    return NextResponse.json({ error: "Unable to load booking options." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const clinicId = String(body.clinicId || "").trim();
    const doctorId = String(body.doctorId || "").trim();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim();
    const type = String(body.type || "Consultation").trim();
    const age = Number.isFinite(Number(body.age)) ? Math.max(0, Math.min(120, Number(body.age))) : 0;
    const gender = String(body.gender || "Not specified").trim();

    if (!clinicId || !doctorId || !name || !phone || !date || !time) {
      return NextResponse.json({ success: false, error: "Clinic, doctor, name, phone, date and time are required." }, { status: 400 });
    }
    if (!validDate(date) || !/^\d{2}:\d{2}$/.test(time) || !slotsForDay().includes(time)) {
      return NextResponse.json({ success: false, error: "Please select a valid appointment date and time." }, { status: 400 });
    }
    if (!/^[0-9+()\-\s]{7,20}$/.test(phone)) {
      return NextResponse.json({ success: false, error: "Please enter a valid phone number." }, { status: 400 });
    }

    const membership = await prisma.clinicMember.findFirst({
      where: { clinicId, doctorId, role: { in: ["Owner", "Admin", "Consultant"] } },
      include: { clinic: { select: { id: true, name: true } }, doctor: { select: { id: true, name: true } } },
    });
    if (!membership) return NextResponse.json({ success: false, error: "Selected doctor is not available at this clinic." }, { status: 400 });

    const existingAppointment = await prisma.appointment.findFirst({
      where: { doctorId, date, time, status: { in: BOOKING_STATUSES } },
      select: { id: true },
    });
    if (existingAppointment) return NextResponse.json({ success: false, error: "That time slot has just been taken. Please choose another slot." }, { status: 409 });

    let patient = await prisma.patient.findFirst({ where: { clinicId, phone }, orderBy: { createdAt: "asc" } });
    if (!patient) {
      patient = await prisma.patient.create({
        data: { doctorId, clinicId, name, age, gender, phone, bp: "", allergies: "", notes: "" },
      });
    }

    const appointment = await prisma.appointment.create({
      data: {
        doctorId,
        patientId: patient.id,
        patientName: patient.name,
        date,
        time,
        type: type || "Consultation",
        status: "Requested",
      },
    });

    await writeAudit({
      doctorId,
      action: "PUBLIC_BOOKING_REQUESTED",
      entity: "Appointment",
      entityId: appointment.id,
      meta: { clinicId, date, time, type },
    });

    return NextResponse.json({
      success: true,
      appointment: {
        id: appointment.id,
        date: appointment.date,
        time: appointment.time,
        type: appointment.type,
        status: appointment.status,
        clinicName: membership.clinic.name,
        doctorName: membership.doctor.name,
      },
    });
  } catch (e) {
    console.error("public booking post", e);
    return NextResponse.json({ success: false, error: "Unable to request the appointment." }, { status: 500 });
  }
}
