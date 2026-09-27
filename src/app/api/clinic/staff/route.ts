import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { getSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { writeAudit } from "@/lib/audit";
import type { ClinicRole } from "@/lib/clinic-auth";
import { allocateStaffCode } from "@/lib/staff-id";
import { createTelegramLinkChallenge, ensureTelegramWebhook, classifyTelegramError, roleRequiresOtp } from "@/lib/otp";

const STAFF_ROLES: ClinicRole[] = [
  "Admin", "Manager", "Consultant", "Doctor", "RMO", "Nurse", "Pharmacy", "Laboratory", "Billing", "Receptionist", "Staff",
];

async function getManagerContext() {
  const session = await getSession();
  if (!session) return null;
  const selected = await requireActiveClinicMembership(session.doctorId);
  if (!selected) return null;
  const membership = await prisma.clinicMember.findUnique({
    where: { id: selected.membershipId },
    include: { clinic: true },
  });
  if (!membership || !["Owner", "Admin", "Manager"].includes(membership.role)) return null;
  return { session, membership };
}

function serializeMember(
  m: {
    id: string;
    clinicId: string;
    doctorId: string;
    role: string;
    staffCode: string;
    designation: string;
    department: string;
    isActive: boolean;
    deactivatedAt: Date | null;
    createdAt: Date;
    doctor: {
      id: string;
      name: string;
      email: string;
      phone: string;
      clinicName: string;
      isActive: boolean;
      deactivatedAt: Date | null;
    };
  },
  telegram?: { telegramUsername: string | null; linkedAt: Date | null } | null
) {
  return {
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
    telegramLinked: Boolean(telegram),
    telegramUsername: telegram?.telegramUsername || null,
    telegramLinkedAt: telegram?.linkedAt || null,
    doctor: m.doctor,
  };
}

export async function GET(req: Request) {
  const ctx = await getManagerContext();
  if (!ctx) return NextResponse.json({ error: "Only clinic owners, admins, or managers can view staff." }, { status: 403 });

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "all").toLowerCase();
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  const members = await prisma.clinicMember.findMany({
    where: {
      clinicId: ctx.membership.clinicId,
      ...(status === "active" ? { isActive: true, doctor: { isActive: true } } : {}),
      ...(status === "inactive" ? { OR: [{ isActive: false }, { doctor: { isActive: false } }] } : {}),
    },
    include: {
      doctor: { select: { id: true, name: true, email: true, phone: true, clinicName: true, isActive: true, deactivatedAt: true } },
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
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

  const telegramIds = await prisma.telegramIdentity.findMany({
    where: { doctorId: { in: members.map((m) => m.doctorId) } },
    select: { doctorId: true, telegramUsername: true, linkedAt: true },
  });
  const telegramByDoctor = new Map(telegramIds.map((i) => [i.doctorId, i]));

  let mapped = members.map((m) => serializeMember(m, telegramByDoctor.get(m.doctorId)));

  if (q) {
    mapped = mapped.filter((m) => {
      const hay = [
        m.doctor?.name,
        m.doctor?.email,
        m.doctor?.phone,
        m.staffCode,
        m.role,
        m.designation,
        m.department,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const allForCounts = await prisma.clinicMember.findMany({
    where: { clinicId: ctx.membership.clinicId },
    select: { isActive: true, doctor: { select: { isActive: true } } },
  });
  const activeCount = allForCounts.filter((m) => m.isActive && m.doctor?.isActive).length;
  const inactiveCount = allForCounts.length - activeCount;

  return NextResponse.json({
    clinic: {
      id: ctx.membership.clinic.id,
      name: ctx.membership.clinic.name,
      isActive: ctx.membership.clinic.isActive,
    },
    currentMember: {
      id: ctx.membership.id,
      doctorId: ctx.session.doctorId,
      role: ctx.membership.role,
      staffCode: ctx.membership.staffCode,
    },
    counts: { total: allForCounts.length, active: activeCount, inactive: inactiveCount },
    members: mapped,
  });
}

async function applyStaffAction(
  ctx: NonNullable<Awaited<ReturnType<typeof getManagerContext>>>,
  body: Record<string, unknown>
) {
  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
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

  if (action === "update-details") {
    // Staff Login ID (staffCode) is permanent and never edited here.
    const designation = typeof body.designation === "string" ? body.designation.trim() : target.designation;
    const department = typeof body.department === "string" ? body.department.trim() : target.department;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";

    if (name && name.length < 2) {
      return NextResponse.json({ error: "Name must be at least 2 characters." }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }
    if (email && email !== target.doctor.email) {
      const clash = await prisma.doctor.findFirst({
        where: { email, NOT: { id: target.doctorId } },
        select: { id: true },
      });
      if (clash) return NextResponse.json({ error: "Email is already used by another account." }, { status: 409 });
    }

    const doctorData: { name?: string; email?: string; phone?: string } = {};
    if (name) doctorData.name = name;
    if (email) doctorData.email = email;
    if (phone) doctorData.phone = phone;

    if (Object.keys(doctorData).length > 0) {
      await prisma.doctor.update({
        where: { id: target.doctorId },
        data: doctorData,
      });
    }

    const member = await prisma.clinicMember.update({
      where: { id },
      data: { designation: designation || target.role, department: department || "" },
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            clinicName: true,
            isActive: true,
            deactivatedAt: true,
          },
        },
      },
    });
    await writeAudit({
      doctorId: ctx.session.doctorId,
      action: "CLINIC_MEMBER_DETAILS_UPDATED",
      entity: "ClinicMember",
      entityId: id,
      clinicId: ctx.membership.clinicId,
      meta: {
        clinicId: ctx.membership.clinicId,
        targetDoctorId: target.doctorId,
        staffCode: target.staffCode,
        designation: member.designation,
        department: member.department,
        name: member.doctor.name,
        email: member.doctor.email,
        phone: member.doctor.phone,
      },
    });
    return NextResponse.json({ success: true, member: serializeMember(member) });
  }

  if (action === "role") {
    if (ctx.membership.role === "Manager") {
      return NextResponse.json({ error: "Managers cannot change staff roles. Ask an Owner or Admin." }, { status: 403 });
    }
    // Staff ID is permanent and is never reassigned on role change.
    const role =
      typeof body.role === "string" && STAFF_ROLES.includes(body.role as ClinicRole)
        ? (body.role as ClinicRole)
        : null;
    if (!role) return NextResponse.json({ error: "Invalid staff role." }, { status: 400 });
    if (role === "Admin" && ctx.membership.role !== "Owner") {
      return NextResponse.json({ error: "Only the clinic owner can assign Admin." }, { status: 403 });
    }
    const previousRole = target.role;
    const member = await prisma.clinicMember.update({
      where: { id },
      data: {
        role,
        designation:
          typeof body.designation === "string" && body.designation.trim()
            ? body.designation.trim()
            : role,
        ...(typeof body.department === "string" ? { department: body.department.trim() } : {}),
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
    return NextResponse.json({ success: true, member, staffCode: target.staffCode });
  }

  if (action === "deactivate" || action === "reactivate") {
    if (ctx.membership.role === "Manager" && ["Admin", "Manager"].includes(target.role)) {
      return NextResponse.json(
        { error: "Managers cannot deactivate or reactivate Admin/Manager accounts." },
        { status: 403 }
      );
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
    return NextResponse.json({ success: true, member, staffCode: target.staffCode });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}

export async function POST(req: Request) {
  const ctx = await getManagerContext();
  if (!ctx) return NextResponse.json({ error: "Only clinic owners, admins, or managers can manage staff." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "create";

  if (action === "telegram-link") {
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    if (!memberId) return NextResponse.json({ error: "Staff member is required." }, { status: 400 });

    const target = await prisma.clinicMember.findFirst({
      where: { id: memberId, clinicId: ctx.membership.clinicId, isActive: true, doctor: { isActive: true } },
      include: { doctor: { select: { id: true, name: true, email: true } } },
    });
    if (!target) return NextResponse.json({ error: "Active staff member not found." }, { status: 404 });
    if (!roleRequiresOtp(target.role)) {
      return NextResponse.json({ error: "Telegram linking is not required for this role." }, { status: 400 });
    }
    if (target.role === "Owner" && target.doctorId !== ctx.session.doctorId) {
      return NextResponse.json({ error: "Only the owner can link the owner's Telegram account." }, { status: 403 });
    }
    if (target.role === "Admin" && ctx.membership.role !== "Owner" && target.doctorId !== ctx.session.doctorId) {
      return NextResponse.json({ error: "Only the clinic owner can link another Admin's Telegram account." }, { status: 403 });
    }
    if (
      target.role === "Manager" &&
      target.doctorId !== ctx.session.doctorId &&
      !["Owner", "Admin"].includes(ctx.membership.role)
    ) {
      return NextResponse.json(
        { error: "Only the clinic owner or an Admin can link another Manager's Telegram account." },
        { status: 403 }
      );
    }

    const existing = await prisma.telegramIdentity.findUnique({
      where: { doctorId: target.doctorId },
      select: { telegramUsername: true, linkedAt: true },
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyLinked: true,
        telegramLinked: true,
        telegramUsername: existing.telegramUsername || null,
        linkedAt: existing.linkedAt?.toISOString() || null,
      });
    }

    const username = String(process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
    if (!username) {
      return NextResponse.json(
        { success: false, error: "Telegram bot is not configured.", reason: "CONFIG_MISSING" },
        { status: 503 }
      );
    }
    try {
      await ensureTelegramWebhook();
      const { token, expiresAt } = await createTelegramLinkChallenge(target.doctorId);
      await writeAudit({
        doctorId: ctx.session.doctorId,
        action: "telegram_staff_link_started",
        entity: "TelegramLinkChallenge",
        entityId: target.doctorId,
        meta: { targetDoctorId: target.doctorId, targetRole: target.role },
        clinicId: ctx.membership.clinicId,
      });
      return NextResponse.json({
        success: true,
        alreadyLinked: false,
        telegramLinked: false,
        expiresAt: expiresAt.toISOString(),
        deepLink: `https://t.me/${username}?start=${encodeURIComponent(token)}`,
        target: { doctorId: target.doctorId, name: target.doctor.name, role: target.role },
      });
    } catch (error) {
      const reason = classifyTelegramError(error);
      return NextResponse.json({ success: false, error: "Telegram could not be configured.", reason }, { status: 503 });
    }
  }

  if (action === "deactivate" || action === "reactivate" || action === "role" || action === "update-details") {
    return applyStaffAction(ctx, body);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role =
    typeof body.role === "string" && STAFF_ROLES.includes(body.role as ClinicRole)
      ? (body.role as ClinicRole)
      : null;
  const designation = typeof body.designation === "string" ? body.designation.trim() : "";
  const department = typeof body.department === "string" ? body.department.trim() : "";

  if (!name || !email || !phone || !password || !role) {
    return NextResponse.json(
      { error: "Name, email, phone, password and staff role are required." },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Initial password must be at least 8 characters." }, { status: 400 });
  }
  if (role === "Admin" && ctx.membership.role !== "Owner") {
    return NextResponse.json({ error: "Only the clinic owner can create an Admin." }, { status: 403 });
  }

  const existing = await prisma.doctor.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "A MedLum account already exists with this email. Use Add existing account instead." },
      { status: 409 }
    );
  }

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
      doctor: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          clinicName: true,
          isActive: true,
          deactivatedAt: true,
        },
      },
    },
  });

  await writeAudit({
    doctorId: ctx.session.doctorId,
    action: "CLINIC_STAFF_CREATED",
    entity: "ClinicMember",
    entityId: member.id,
    clinicId: ctx.membership.clinicId,
    meta: {
      clinicId: ctx.membership.clinicId,
      staffDoctorId: doctor.id,
      role,
      staffCode,
    },
  });

  let telegramLink: { deepLink: string; expiresAt: string } | null = null;
  if (roleRequiresOtp(role)) {
    const username = String(process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
    if (username) {
      try {
        await ensureTelegramWebhook();
        const { token, expiresAt } = await createTelegramLinkChallenge(doctor.id);
        telegramLink = {
          deepLink: `https://t.me/${username}?start=${encodeURIComponent(token)}`,
          expiresAt: expiresAt.toISOString(),
        };
      } catch {
        // Account creation remains successful; UI will offer a retryable Link Telegram action.
      }
    }
  }

  return NextResponse.json({ success: true, member, telegramLink, staffCode });
}

export async function PATCH(req: Request) {
  const ctx = await getManagerContext();
  if (!ctx) return NextResponse.json({ error: "Only clinic owners, admins, or managers can manage staff." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  return applyStaffAction(ctx, body);
}
