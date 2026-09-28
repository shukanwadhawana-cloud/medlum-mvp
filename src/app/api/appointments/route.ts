import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import {
  appointmentTransitionError,
  normalizeAppointmentStatus,
  normalizeClinicRole,
  roleCan,
} from "@/lib/workflow";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";

const APPT_MARKER = "__MEDLUM_CONSULTANT__";

function encodeType(type: string, name: string, specialty: string, notes: string) {
  return [
    type.replace(/\|/g, "/"),
    APPT_MARKER,
    `name=${name.replace(/[|\n]/g, " ")}`,
    `specialty=${specialty.replace(/[|\n]/g, " ")}`,
    `notes=${notes.replace(/[|\n]/g, " ")}`,
  ].join("|");
}

function serialize(a: {
  id: string;
  doctorId: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  type: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  doctor?: { name: string; id?: string } | null;
  patient?: { name: string; phone?: string; registrationNo?: string; uhid?: string } | null;
}) {
  const parts = String(a.type || "").split(`|${APPT_MARKER}|`);
  const type = parts[0] || a.type;
  const meta = Object.fromEntries(
    String(parts[1] || "")
      .split("|")
      .filter(Boolean)
      .map((x: string) => {
        const i = x.indexOf("=");
        return i > 0 ? [x.slice(0, i), x.slice(i + 1)] : [x, ""];
      })
  );
  return {
    id: a.id,
    doctorId: a.doctorId,
    patientId: a.patientId,
    patientName: a.patientName || a.patient?.name || "",
    patientPhone: a.patient?.phone || "",
    patientRegistrationNo: a.patient?.registrationNo || a.patient?.uhid || "",
    date: a.date,
    time: a.time,
    type,
    status: a.status,
    notes: meta.notes || "",
    consultantName: meta.name || a.doctor?.name || "",
    consultantSpecialty: meta.specialty || "",
    doctorName: a.doctor?.name || meta.name || "",
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

const CLINICAL_DOCTOR_ROLES = new Set(["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO"]);

async function getMembershipContext(doctorId: string) {
  const selected = await requireActiveClinicMembership(doctorId);
  if (!selected) return null;
  const membership = await prisma.clinicMember.findUnique({
    where: { id: selected.membershipId },
    include: { clinic: { select: { id: true, name: true, isActive: true } } },
  });
  if (!membership || !membership.isActive || !membership.clinic?.isActive) return null;
  return { membership, clinicId: membership.clinicId, role: normalizeClinicRole(membership.role) };
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getMembershipContext(session.doctorId);
  if (!ctx) return NextResponse.json({ error: "No active clinic membership." }, { status: 403 });
  if (!roleCan(ctx.role, "appointments")) {
    return NextResponse.json({ error: "Not authorized for appointments." }, { status: 403 });
  }

  const url = new URL(req.url);
  const date = (url.searchParams.get("date") || "").trim();
  const status = (url.searchParams.get("status") || "").trim();
  const doctorId = (url.searchParams.get("doctorId") || "").trim();
  const patientId = (url.searchParams.get("patientId") || "").trim();
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const mine = url.searchParams.get("mine") === "1" || url.searchParams.get("mine") === "true";

  const canManageFacility = ["Owner", "Admin", "Manager", "Receptionist"].includes(ctx.role);

  const where: Record<string, unknown> = {
    doctor: { clinicMemberships: { some: { clinicId: ctx.clinicId, isActive: true } } },
  };

  if (date) where.date = date;
  if (status) {
    const normalized = normalizeAppointmentStatus(status);
    if (normalized) where.status = normalized;
  }
  if (patientId) where.patientId = patientId;

  if (mine || (!canManageFacility && CLINICAL_DOCTOR_ROLES.has(ctx.role))) {
    where.doctorId = session.doctorId;
  } else if (doctorId) {
    where.doctorId = doctorId;
  }

  const appointments = await prisma.appointment.findMany({
    where,
    orderBy: [{ date: "asc" }, { time: "asc" }],
    include: {
      doctor: { select: { id: true, name: true } },
      patient: { select: { name: true, phone: true, registrationNo: true, uhid: true } },
    },
    take: 500,
  });

  let mapped = appointments.map(serialize);
  if (q) {
    mapped = mapped.filter((a) => {
      const hay = [a.patientName, a.patientPhone, a.patientRegistrationNo, a.doctorName, a.consultantName, a.type, a.notes, a.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const doctors = await prisma.clinicMember.findMany({
    where: {
      clinicId: ctx.clinicId,
      isActive: true,
      role: { in: ["Owner", "Admin", "Manager", "Consultant", "Doctor", "RMO"] },
      doctor: { isActive: true },
    },
    include: { doctor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    {
      clinic: { id: ctx.membership.clinic.id, name: ctx.membership.clinic.name },
      currentRole: ctx.role,
      canManage: canManageFacility || roleCan(ctx.role, "appointments"),
      doctors: doctors.map((m) => ({
        doctorId: m.doctorId,
        name: m.doctor.name,
        role: m.role,
        staffCode: m.staffCode,
      })),
      appointments: mapped,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getMembershipContext(session.doctorId);
  if (!ctx) return NextResponse.json({ error: "No active clinic membership." }, { status: 403 });
  if (!roleCan(ctx.role, "appointments")) {
    return NextResponse.json({ error: "Not authorized to create appointments." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const patientId = String(body.patientId || "");
    const date = String(body.date || "").trim();
    const time = String(body.time || "").trim();
    const type = String(body.type || "Consultation").trim() || "Consultation";
    const notes = String(body.notes || body.reason || "").trim();
    const consultantName = String(body.consultantName || "").trim();
    const consultantSpecialty = String(body.consultantSpecialty || "").trim();
    let assignedDoctorId = String(body.doctorId || body.assignedDoctorId || "").trim();

    if (!patientId || !date || !time) {
      return NextResponse.json({ success: false, error: "Patient, date and time are required." }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, error: "Invalid date format (YYYY-MM-DD)." }, { status: 400 });
    }

    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        clinicId: ctx.clinicId,
        deletedAt: null,
        status: { notIn: ["ARCHIVED"] },
      },
    });
    if (!patient) {
      return NextResponse.json({ success: false, error: "Patient not found in this facility." }, { status: 404 });
    }

    if (!assignedDoctorId) assignedDoctorId = session.doctorId;
    const assignee = await prisma.clinicMember.findFirst({
      where: {
        clinicId: ctx.clinicId,
        doctorId: assignedDoctorId,
        isActive: true,
        doctor: { isActive: true },
      },
      include: { doctor: { select: { id: true, name: true } } },
    });
    if (!assignee) {
      return NextResponse.json({ success: false, error: "Assigned doctor is not an active member of this facility." }, { status: 400 });
    }

    const conflict = await prisma.appointment.findFirst({
      where: {
        patientId,
        doctorId: assignedDoctorId,
        date,
        time,
        status: { notIn: ["Cancelled", "Completed", "No Show"] },
      },
      select: { id: true, status: true },
    });
    if (conflict) {
      return NextResponse.json(
        {
          success: false,
          error: "An active appointment already exists for this patient, doctor, date and time.",
          conflictId: conflict.id,
        },
        { status: 409 }
      );
    }

    const displayName = consultantName || assignee.doctor.name;
    const appt = await prisma.appointment.create({
      data: {
        doctorId: assignedDoctorId,
        patientId,
        patientName: patient.name,
        date,
        time,
        type: encodeType(type, displayName, consultantSpecialty, notes),
        status: "Scheduled",
      },
      include: {
        doctor: { select: { id: true, name: true } },
        patient: { select: { name: true, phone: true, registrationNo: true, uhid: true } },
      },
    });

    await writeAudit({
      doctorId: session.doctorId,
      action: "APPOINTMENT_CREATED",
      entity: "Appointment",
      entityId: appt.id,
      clinicId: ctx.clinicId,
      meta: {
        clinicId: ctx.clinicId,
        patientId,
        assignedDoctorId,
        date,
        time,
        type,
        notes: notes || undefined,
      },
    });

    return NextResponse.json({ success: true, appointment: serialize(appt) });
  } catch (e) {
    console.error("create appt", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getMembershipContext(session.doctorId);
  if (!ctx) return NextResponse.json({ error: "No active clinic membership." }, { status: 403 });
  if (!roleCan(ctx.role, "appointments")) {
    return NextResponse.json({ error: "Not authorized to update appointments." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

    const existing = await prisma.appointment.findFirst({
      where: {
        id,
        doctor: { clinicMemberships: { some: { clinicId: ctx.clinicId, isActive: true } } },
      },
      include: { doctor: { select: { id: true, name: true } } },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const canManageFacility = ["Owner", "Admin", "Manager", "Receptionist"].includes(ctx.role);
    if (!canManageFacility && existing.doctorId !== session.doctorId) {
      return NextResponse.json({ success: false, error: "You can only update your own appointments." }, { status: 403 });
    }

    if (body.status) {
      const normalized = normalizeAppointmentStatus(String(body.status));
      if (!normalized) {
        return NextResponse.json({ success: false, error: `Invalid appointment status: ${body.status}` }, { status: 400 });
      }
      const transitionError = appointmentTransitionError(existing.status, normalized);
      if (transitionError) {
        return NextResponse.json({ success: false, error: transitionError }, { status: 409 });
      }
      const updated = await prisma.appointment.update({
        where: { id },
        data: { status: normalized },
        include: {
          doctor: { select: { id: true, name: true } },
          patient: { select: { name: true, phone: true, registrationNo: true, uhid: true } },
        },
      });
      await writeAudit({
        doctorId: session.doctorId,
        action: "APPOINTMENT_STATUS_UPDATED",
        entity: "Appointment",
        entityId: id,
        clinicId: ctx.clinicId,
        meta: { from: existing.status, to: normalized, clinicId: ctx.clinicId },
      });
      return NextResponse.json({ success: true, appointment: serialize(updated) });
    }

    if (body.doctorId || body.assignedDoctorId) {
      if (!canManageFacility) {
        return NextResponse.json({ success: false, error: "Only facility managers or reception can reassign doctors." }, { status: 403 });
      }
      const newDoctorId = String(body.doctorId || body.assignedDoctorId).trim();
      const assignee = await prisma.clinicMember.findFirst({
        where: {
          clinicId: ctx.clinicId,
          doctorId: newDoctorId,
          isActive: true,
          doctor: { isActive: true },
        },
        include: { doctor: { select: { name: true } } },
      });
      if (!assignee) {
        return NextResponse.json({ success: false, error: "Assigned doctor is not an active member of this facility." }, { status: 400 });
      }
      if (["Completed", "Cancelled", "No Show"].includes(existing.status)) {
        return NextResponse.json({ success: false, error: "Cannot reassign a terminal appointment." }, { status: 409 });
      }
      const updated = await prisma.appointment.update({
        where: { id },
        data: { doctorId: newDoctorId },
        include: {
          doctor: { select: { id: true, name: true } },
          patient: { select: { name: true, phone: true, registrationNo: true, uhid: true } },
        },
      });
      await writeAudit({
        doctorId: session.doctorId,
        action: "APPOINTMENT_REASSIGNED",
        entity: "Appointment",
        entityId: id,
        clinicId: ctx.clinicId,
        meta: { fromDoctorId: existing.doctorId, toDoctorId: newDoctorId, clinicId: ctx.clinicId },
      });
      return NextResponse.json({ success: true, appointment: serialize(updated) });
    }

    return NextResponse.json({ success: false, error: "No supported update fields provided." }, { status: 400 });
  } catch (e) {
    console.error("patch appt", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
