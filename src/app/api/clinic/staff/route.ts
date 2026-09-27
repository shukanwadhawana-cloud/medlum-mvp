import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { getSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { allocateStaffCode } from "@/lib/staff-id";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["Owner", "Admin", "Manager", "Doctor", "Nurse", "Receptionist", "Pharmacist", "Lab", "Billing"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

function serializeMember(m: {
  id: string;
  role: string;
  isActive: boolean;
  designation: string | null;
  department: string | null;
  staffCode: string | null;
  deactivatedAt: Date | null;
  doctor: { id: string; name: string; email: string | null; phone: string | null; telegramChatId: string | null };
}) {
  return {
    id: m.id,
    role: m.role,
    isActive: m.isActive,
    designation: m.designation,
    department: m.department,
    staffCode: m.staffCode,
    deactivatedAt: m.deactivatedAt?.toISOString() ?? null,
    doctor: {
      id: m.doctor.id,
      name: m.doctor.name,
      email: m.doctor.email,
      phone: m.doctor.phone,
      telegramLinked: Boolean(m.doctor.telegramChatId),
    },
  };
}

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ctx = await requireActiveClinicMembership();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "all").toLowerCase();
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    const where: {
      clinicId: string;
      isActive?: boolean;
      OR?: Array<Record<string, unknown>>;
    } = { clinicId: ctx.membership.clinicId };

    if (status === "active") where.isActive = true;
    else if (status === "inactive") where.isActive = false;

    if (q) {
      where.OR = [
        { doctor: { name: { contains: q, mode: "insensitive" } } },
        { doctor: { email: { contains: q, mode: "insensitive" } } },
        { staffCode: { contains: q, mode: "insensitive" } },
        { designation: { contains: q, mode: "insensitive" } },
        { department: { contains: q, mode: "insensitive" } },
        { role: { contains: q, mode: "insensitive" } },
      ];
    }

    const members = await prisma.clinicMember.findMany({
      where,
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            telegramChatId: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { role: "asc" }, { doctor: { name: "asc" } }],
    });

    const allCount = await prisma.clinicMember.count({ where: { clinicId: ctx.membership.clinicId } });
    const activeCount = await prisma.clinicMember.count({
      where: { clinicId: ctx.membership.clinicId, isActive: true },
    });
    const inactiveCount = allCount - activeCount;

    return NextResponse.json({
      members: members.map(serializeMember),
      counts: { all: allCount, active: activeCount, inactive: inactiveCount },
      clinic: {
        id: ctx.clinic.id,
        name: ctx.clinic.name,
      },
      currentMember: {
        id: ctx.membership.id,
        role: ctx.membership.role,
        staffCode: ctx.membership.staffCode,
      },
    });
  } catch (e) {
    console.error("[staff GET]", e);
    return NextResponse.json({ error: "Failed to load staff" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ctx = await requireActiveClinicMembership();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    if (!["Owner", "Admin"].includes(ctx.membership.role)) {
      return NextResponse.json({ error: "Only Owner or Admin can create staff" }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase() || null;
    const phone = String(body.phone || "").trim() || null;
    const password = String(body.password || "").trim();
    const role = String(body.role || "Receptionist").trim();
    const designation = String(body.designation || "").trim() || null;
    const department = String(body.department || "").trim() || null;

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    if (!STAFF_ROLES.includes(role as StaffRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (role === "Owner") {
      return NextResponse.json({ error: "Cannot create another Owner via staff API" }, { status: 400 });
    }
    if (role === "Admin" && ctx.membership.role !== "Owner") {
      return NextResponse.json({ error: "Only the clinic owner can create an Admin" }, { status: 403 });
    }

    const passwordHash = await hashPassword(password);
    const staffCode = await allocateStaffCode(ctx.membership.clinicId);

    const doctor = await prisma.doctor.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
      },
    });

    const member = await prisma.clinicMember.create({
      data: {
        clinicId: ctx.membership.clinicId,
        doctorId: doctor.id,
        role,
        isActive: true,
        staffCode,
        designation,
        department,
      },
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            telegramChatId: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        clinicId: ctx.membership.clinicId,
        actorDoctorId: session.doctorId,
        action: "CLINIC_MEMBER_CREATED",
        entityType: "ClinicMember",
        entityId: member.id,
        meta: { role, staffCode, designation, department },
      },
    }).catch(() => {});

    return NextResponse.json({ member: serializeMember(member) }, { status: 201 });
  } catch (e: unknown) {
    console.error("[staff POST]", e);
    const msg = e instanceof Error ? e.message : "Failed to create staff";
    if (String(msg).includes("Unique constraint")) {
      return NextResponse.json({ error: "Email or staff code already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create staff" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ctx = await requireActiveClinicMembership();
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const body = await req.json();
    const action = String(body.action || "").trim();
    const memberId = String(body.memberId || body.id || "").trim();

    if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

    const target = await prisma.clinicMember.findFirst({
      where: { id: memberId, clinicId: ctx.membership.clinicId },
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            telegramChatId: true,
          },
        },
      },
    });

    if (!target) return NextResponse.json({ error: "Staff member not found in this facility" }, { status: 404 });

    const canManage = ["Owner", "Admin", "Manager"].includes(ctx.membership.role);
    if (!canManage) {
      return NextResponse.json({ error: "Insufficient role to manage staff" }, { status: 403 });
    }

    if (action === "update-details") {
      const designation =
        body.designation !== undefined ? String(body.designation || "").trim() || null : target.designation;
      const department =
        body.department !== undefined ? String(body.department || "").trim() || null : target.department;
      const name = body.name !== undefined ? String(body.name || "").trim() : target.doctor.name;
      const phone = body.phone !== undefined ? String(body.phone || "").trim() || null : target.doctor.phone;

      if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

      await prisma.doctor.update({
        where: { id: target.doctorId },
        data: { name, phone },
      });

      const updated = await prisma.clinicMember.update({
        where: { id: target.id },
        data: { designation, department },
        include: {
          doctor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              telegramChatId: true,
            },
          },
        },
      });

      return NextResponse.json({ member: serializeMember(updated) });
    }

    if (action === "role") {
      if (!["Owner", "Admin"].includes(ctx.membership.role)) {
        return NextResponse.json({ error: "Managers cannot change staff roles" }, { status: 403 });
      }
      const newRole = String(body.role || "").trim();
      if (!STAFF_ROLES.includes(newRole as StaffRole)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      if (newRole === "Owner") {
        return NextResponse.json({ error: "Cannot assign Owner via this action" }, { status: 400 });
      }
      if (newRole === "Admin" && ctx.membership.role !== "Owner") {
        return NextResponse.json({ error: "Only the clinic owner can assign Admin" }, { status: 403 });
      }
      if (target.role === "Owner") {
        return NextResponse.json({ error: "Cannot change Owner role" }, { status: 403 });
      }

      const updated = await prisma.clinicMember.update({
        where: { id: target.id },
        data: { role: newRole },
        include: {
          doctor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              telegramChatId: true,
            },
          },
        },
      });

      await prisma.auditLog.create({
        data: {
          clinicId: ctx.membership.clinicId,
          actorDoctorId: session.doctorId,
          action: "CLINIC_MEMBER_ROLE_CHANGED",
          entityType: "ClinicMember",
          entityId: target.id,
          meta: { from: target.role, to: newRole, staffCode: target.staffCode },
        },
      }).catch(() => {});

      return NextResponse.json({ member: serializeMember(updated) });
    }

    if (action === "deactivate") {
      if (ctx.membership.role === "Manager" && !["Doctor", "Nurse", "Receptionist", "Pharmacist", "Lab", "Billing"].includes(target.role)) {
        return NextResponse.json({ error: "Managers cannot deactivate Admin or Owner" }, { status: 403 });
      }
      if (target.role === "Owner") {
        return NextResponse.json({ error: "Cannot deactivate Owner" }, { status: 403 });
      }
      if (target.id === ctx.membership.id) {
        return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });
      }

      const updated = await prisma.clinicMember.update({
        where: { id: target.id },
        data: { isActive: false, deactivatedAt: new Date() },
        include: {
          doctor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              telegramChatId: true,
            },
          },
        },
      });

      await prisma.auditLog.create({
        data: {
          clinicId: ctx.membership.clinicId,
          actorDoctorId: session.doctorId,
          action: "CLINIC_MEMBER_DEACTIVATED",
          entityType: "ClinicMember",
          entityId: target.id,
          meta: { staffCode: target.staffCode, role: target.role },
        },
      }).catch(() => {});

      return NextResponse.json({ member: serializeMember(updated) });
    }

    if (action === "reactivate") {
      if (ctx.membership.role === "Manager") {
        return NextResponse.json({ error: "Managers cannot reactivate staff" }, { status: 403 });
      }

      const updated = await prisma.clinicMember.update({
        where: { id: target.id },
        data: { isActive: true, deactivatedAt: null },
        include: {
          doctor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              telegramChatId: true,
            },
          },
        },
      });

      await prisma.auditLog.create({
        data: {
          clinicId: ctx.membership.clinicId,
          actorDoctorId: session.doctorId,
          action: "CLINIC_MEMBER_REACTIVATED",
          entityType: "ClinicMember",
          entityId: target.id,
          meta: { staffCode: target.staffCode },
        },
      }).catch(() => {});

      return NextResponse.json({ member: serializeMember(updated) });
    }

    if (action === "telegram-link") {
      // Surface only; linking is handled by existing Telegram flows
      return NextResponse.json({
        member: serializeMember(target),
        telegramLinked: Boolean(target.doctor.telegramChatId),
        message: "Use existing Telegram link flow from staff profile or duty module",
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("[staff PATCH]", e);
    return NextResponse.json({ error: "Failed to update staff" }, { status: 500 });
  }
}
