import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

async function getContext(allowInactiveClinic = false) {
  const session = await getSession();
  if (!session) return null;
  const membership = await prisma.clinicMember.findFirst({
    where: {
      doctorId: session.doctorId,
      isActive: true,
      ...(allowInactiveClinic ? {} : { clinic: { isActive: true } }),
    },
    include: { clinic: true, doctor: true },
    orderBy: { createdAt: "asc" },
  });
  return membership ? { session, membership } : null;
}

export async function GET() {
  const ctx = await getContext(true);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.membership.clinic.isActive && !["Owner", "Admin"].includes(ctx.membership.role)) {
    return NextResponse.json({ error: "This clinic is deactivated." }, { status: 403 });
  }

  const members = await prisma.clinicMember.findMany({
    where: { clinicId: ctx.membership.clinicId },
    include: { doctor: { select: { id: true, name: true, email: true, phone: true, clinicName: true, isActive: true, deactivatedAt: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    clinic: ctx.membership.clinic,
    currentMember: { id: ctx.membership.id, role: ctx.membership.role, isActive: ctx.membership.isActive },
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      isActive: m.isActive,
      deactivatedAt: m.deactivatedAt,
      createdAt: m.createdAt,
      doctor: m.doctor,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["Owner", "Admin"].includes(ctx.membership.role)) return NextResponse.json({ error: "Only clinic owners or admins can manage consultants." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" && ["Admin", "Consultant", "Staff"].includes(body.role) ? body.role : "Consultant";
  if (!email) return NextResponse.json({ error: "Doctor email is required." }, { status: 400 });

  const doctor = await prisma.doctor.findUnique({ where: { email } });
  if (!doctor) return NextResponse.json({ error: "No MedLum doctor account exists with that email." }, { status: 404 });
  if (!doctor.isActive) return NextResponse.json({ error: "This doctor account is deactivated and cannot be added to a clinic." }, { status: 409 });
  if (doctor.id === ctx.session.doctorId) return NextResponse.json({ error: "You are already a member of this clinic." }, { status: 400 });

  const existing = await prisma.clinicMember.findUnique({ where: { clinicId_doctorId: { clinicId: ctx.membership.clinicId, doctorId: doctor.id } } });
  if (existing) return NextResponse.json({ error: "This doctor is already a member of the clinic." }, { status: 409 });

  const member = await prisma.clinicMember.create({
    data: { clinicId: ctx.membership.clinicId, doctorId: doctor.id, role },
    include: { doctor: { select: { id: true, name: true, email: true, phone: true, clinicName: true, isActive: true, deactivatedAt: true } } },
  });

  await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "CLINIC_MEMBER_ADDED", entity: "ClinicMember", entityId: member.id, meta: JSON.stringify({ clinicId: ctx.membership.clinicId, addedDoctorId: doctor.id, role }) } });
  return NextResponse.json({ success: true, member });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const clinicAction = body.action === "deactivate-clinic" || body.action === "reactivate-clinic";
  const ctx = await getContext(clinicAction);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["Owner", "Admin"].includes(ctx.membership.role)) return NextResponse.json({ error: "Only clinic owners or admins can manage clinic access." }, { status: 403 });

  if (clinicAction) {
    const isActive = body.action === "reactivate-clinic";
    if (ctx.membership.clinic.isActive === isActive) return NextResponse.json({ success: true, clinic: ctx.membership.clinic });
    const clinic = await prisma.clinic.update({ where: { id: ctx.membership.clinicId }, data: { isActive, deactivatedAt: isActive ? null : new Date() } });
    await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: isActive ? "CLINIC_REACTIVATED" : "CLINIC_DEACTIVATED", entity: "Clinic", entityId: clinic.id, meta: JSON.stringify({ clinicId: clinic.id }) } });
    return NextResponse.json({ success: true, clinic });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Membership id is required." }, { status: 400 });
  const target = await prisma.clinicMember.findFirst({ where: { id, clinicId: ctx.membership.clinicId } });
  if (!target) return NextResponse.json({ error: "Clinic member not found." }, { status: 404 });
  if (target.role === "Owner") return NextResponse.json({ error: "The clinic owner cannot be deactivated or have the owner role changed here." }, { status: 400 });

  const action = body.action === "reactivate" ? "reactivate" : body.action === "deactivate" ? "deactivate" : "role";
  if (action === "role") {
    const role = typeof body.role === "string" && ["Admin", "Consultant", "Staff"].includes(body.role) ? body.role : "Consultant";
    const previousRole = target.role;
    const member = await prisma.clinicMember.update({ where: { id }, data: { role } });
    await prisma.auditLog.create({
      data: {
        doctorId: ctx.session.doctorId,
        action: "CLINIC_MEMBER_ROLE_CHANGED",
        entity: "ClinicMember",
        entityId: id,
        meta: JSON.stringify({
          clinicId: ctx.membership.clinicId,
          targetDoctorId: target.doctorId,
          previousRole,
          newRole: role,
        }),
      },
    });
    return NextResponse.json({ success: true, member });
  }

  const isActive = action === "reactivate";
  const member = await prisma.clinicMember.update({ where: { id }, data: { isActive, deactivatedAt: isActive ? null : new Date() } });
  await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: isActive ? "CLINIC_MEMBER_REACTIVATED" : "CLINIC_MEMBER_DEACTIVATED", entity: "ClinicMember", entityId: id, meta: JSON.stringify({ clinicId: ctx.membership.clinicId, targetDoctorId: target.doctorId }) } });
  return NextResponse.json({ success: true, member });
}

export async function DELETE(req: Request) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["Owner", "Admin"].includes(ctx.membership.role)) return NextResponse.json({ error: "Only clinic owners or admins can manage consultants." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const target = await prisma.clinicMember.findFirst({ where: { id, clinicId: ctx.membership.clinicId } });
  if (!target) return NextResponse.json({ error: "Clinic member not found." }, { status: 404 });
  if (target.role === "Owner") return NextResponse.json({ error: "The clinic owner cannot be removed." }, { status: 400 });

  const member = await prisma.clinicMember.update({ where: { id }, data: { isActive: false, deactivatedAt: new Date() } });
  await prisma.auditLog.create({ data: { doctorId: ctx.session.doctorId, action: "CLINIC_MEMBER_DEACTIVATED", entity: "ClinicMember", entityId: id, meta: JSON.stringify({ clinicId: ctx.membership.clinicId, targetDoctorId: target.doctorId, legacyDeleteRequest: true }) } });
  return NextResponse.json({ success: true, deactivated: true, member });
}
