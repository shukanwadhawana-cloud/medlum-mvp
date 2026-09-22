import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { writeAudit } from "@/lib/audit";
import type { ClinicRole } from "@/lib/clinic-auth";
import { allocateStaffCode } from "@/lib/staff-id";

const STAFF_ROLES: ClinicRole[] = [
  "Admin", "Manager", "Consultant", "Doctor", "RMO", "Nurse", "Pharmacy", "Laboratory", "Billing", "Receptionist", "Staff",
];

async function getManagerContext() {
  const session = await getSession();
  if (!session) return null;
  const membership = await prisma.clinicMember.findFirst({
    where: { doctorId: session.doctorId, isActive: true, clinic: { isActive: true } },
    include: { clinic: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership || !["Owner", "Admin", "Manager"].includes(membership.role)) return null;
  return { session, membership };
}

export async function GET() {
  const ctx = await getManagerContext();
  if (!ctx) return NextResponse.json({ error: "Only clinic owners, admins, or managers can view staff." }, { status: 403 });

  const members = await prisma.clinicMember.findMany({
    where: { clinicId: ctx.membership.clinicId },
    include: {
      doctor: { select: { id: true, name: true, email: true, phone: true, clinicName: true, isActive: true, deactivatedAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const m of members) {
    if (!m.staffCode) {
      try {
        const code = await allocateStaffCode(m.clinicId, m.role);
        await prisma.clinicMember.update({
          where: { id: m.id },
          data: { staffCode: code, designation: m.designation || m.role },
        });
        (m as { staffCode: string }).staffCode = code;
      } catch {
        /* ignore */
      }
    }
  }

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      clinicId: m.clinicId,
      doctorId: m.doctorId,
      role: m.role,
      staffCode: m.staffCode,
      designation: m.designation || m.role,
      department: m.department || "",
      isActive: m.isActive,
      deactivatedAt: m.deactivatedAt,
      createdAt: m.createdAt,
      doctor: m.doctor,
    })),
  });
}

export async function POST(req: Request) {
  const ctx = await getManagerContext();
  if (!ctx) return NextResponse.json({ error: "Only clinic owners, admins, or managers can manage staff." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = typeof body.role === "string" && STAFF_ROLES.includes(body.role as ClinicRole) ? (body.role as ClinicRole) : null;
  const designation = typeof body.designation === "string" ? body.designation.trim() : "";
  const department = typeof body.department === "string" ? body.department.trim() : "";

  if (!name || !email || !phone || !password || !role) {
    return NextResponse.json({ error: "Name, email, phone, password and staff role are required." }, { status: 400 });
  }
  if (password.length < 8) return NextResponse.json({ error: "Initial password must be at least 8 characters." }, { status: 400 });
  if (role === "Admin" && ctx.membership.role !== "Owner") {
    return NextResponse.json({ error: "Only the clinic owner can create an Admin." }, { status: 403 });
  }

  const existing = await prisma.doctor.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "A MedLum account already exists with this email. Use Add existing account instead." }, { status: 409 });

  const staffCode = await allocateStaffCode(ctx.membership.clinicId, role);
  const doctor = await prisma.doctor.create({
    data: {
      name,
      email,
      phone,
      passwordHash: await hashPassword(password),
      clinicName: ctx.membership.clinic.name,
    },
  });

  const member = await prisma.clinicMember.create({
    data: {
      clinicId: ctx.membership.clinicId,
      doctorId: doctor.id,
      role,
      staffCode,
      designation: designation || role,
      department,
    },
    include: {
      doctor: { select: { id: true, name: true, email: true, phone: true, clinicName: true, isActive: true, deactivatedAt: true } },
    },
  });

  await writeAudit({
    doctorId: ctx.session.doctorId,
    action: "CLINIC_STAFF_CREATED",
    entity: "ClinicMember",
    entityId: member.id,
    clinicId: ctx.membership.clinicId,
    meta: { clinicId: ctx.membership.clinicId, staffDoctorId: doctor.id, role, staffCode },
  });

  return NextResponse.json({ success: true, member });
}

export async function PATCH(req: Request) {
  const ctx = await getManagerContext();
  if (!ctx) return NextResponse.json({ error: "Only clinic owners, admins, or managers can manage staff." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action === "deactivate" || body.action === "reactivate" || body.action === "role" ? body.action : "";
  if (!id || !action) return NextResponse.json({ error: "Membership id and valid action are required." }, { status: 400 });

  const target = await prisma.clinicMember.findFirst({
    where: { id, clinicId: ctx.membership.clinicId },
    include: { doctor: true },
  });
  if (!target) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  if (target.role === "Owner") return NextResponse.json({ error: "The clinic owner cannot be changed here." }, { status: 400 });
  if (target.role === "Admin" && ctx.membership.role !== "Owner") {
    return NextResponse.json({ error: "Only the clinic owner can manage an Admin." }, { status: 403 });
  }

  if (action === "role") {
    const role = typeof body.role === "string" && STAFF_ROLES.includes(body.role as ClinicRole) ? (body.role as ClinicRole) : null;
    if (!role) return NextResponse.json({ error: "Invalid staff role." }, { status: 400 });
    if (role === "Admin" && ctx.membership.role !== "Owner") {
      return NextResponse.json({ error: "Only the clinic owner can assign Admin." }, { status: 403 });
    }
    const previousRole = target.role;
    // Staff ID is permanent — do not change with role
    const member = await prisma.clinicMember.update({
      where: { id },
      data: {
        role,
        designation:
          typeof body.designation === "string" && body.designation.trim() ? body.designation.trim() : role,
      },
    });
    await writeAudit({
      doctorId: ctx.session.doctorId,
      action: "CLINIC_MEMBER_ROLE_CHANGED",
      entity: "ClinicMember",
      entityId: id,
      clinicId: ctx.membership.clinicId,
      meta: {
        clinicId: ctx.membership.clinicId,
        targetDoctorId: target.doctorId,
        previousRole,
        newRole: role,
        staffCode: target.staffCode,
      },
    });
    return NextResponse.json({ success: true, member });
  }

  const isActive = action === "reactivate";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const member = await prisma.clinicMember.update({
    where: { id },
    data: { isActive, deactivatedAt: isActive ? null : new Date() },
  });
  await writeAudit({
    doctorId: ctx.session.doctorId,
    action: isActive ? "CLINIC_MEMBER_REACTIVATED" : "CLINIC_MEMBER_DEACTIVATED",
    entity: "ClinicMember",
    entityId: id,
    clinicId: ctx.membership.clinicId,
    meta: {
      clinicId: ctx.membership.clinicId,
      targetDoctorId: target.doctorId,
      staffCode: target.staffCode,
      reason: reason || undefined,
    },
  });
  return NextResponse.json({ success: true, member });
}
