import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { isDutyAdminRole, istDateKey } from "@/lib/duty";

async function ctx(doctorId: string) {
  const m = await requireActiveClinicMembership(doctorId);
  if (!m?.clinicId || !m.membershipId) return null;
  return prisma.clinicMember.findFirst({
    where: { id: m.membershipId, isActive: true },
    select: {
      id: true,
      clinicId: true,
      doctorId: true,
      role: true,
      doctor: { select: { name: true } },
    },
  });
}

/** GET — own requests, or all clinic pending if admin */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await ctx(session.doctorId);
  if (!me) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const role = normalizeClinicRole(me.role);
  const isAdmin = isDutyAdminRole(role);
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope"); // "pending" | "mine" | default mine for staff, pending for admin

  const where =
    isAdmin && scope === "pending"
      ? { clinicId: me.clinicId, status: "PENDING" as const }
      : isAdmin && scope === "all"
        ? { clinicId: me.clinicId }
        : { clinicId: me.clinicId, memberId: me.id };

  const rows = await prisma.dutyAttendanceRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      memberId: true,
      doctorId: true,
      requestType: true,
      status: true,
      dayDate: true,
      requestedInAt: true,
      requestedOutAt: true,
      reason: true,
      reviewerDoctorId: true,
      reviewerNote: true,
      reviewedAt: true,
      createdAt: true,
      member: { select: { staffCode: true, doctor: { select: { name: true } } } },
    },
  });

  return NextResponse.json({
    isAdmin,
    requests: rows.map((r) => ({
      id: r.id,
      memberId: r.memberId,
      staffName: r.member.doctor.name,
      staffCode: r.member.staffCode,
      requestType: r.requestType,
      status: r.status,
      dayDate: r.dayDate,
      requestedInAt: r.requestedInAt,
      requestedOutAt: r.requestedOutAt,
      reason: r.reason,
      reviewerNote: r.reviewerNote,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    })),
  });
}

/** POST — create REGULARIZE or LEAVE request (self only) */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await ctx(session.doctorId);
  if (!me) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const requestType = String(body.requestType || "").toUpperCase();
  if (requestType !== "REGULARIZE" && requestType !== "LEAVE") {
    return NextResponse.json({ error: "requestType must be REGULARIZE or LEAVE" }, { status: 400 });
  }
  const reason = String(body.reason || "").trim().slice(0, 1000);
  if (reason.length < 3) {
    return NextResponse.json({ error: "Reason is required (min 3 characters)" }, { status: 400 });
  }

  let dayDate: Date;
  const dayStr = String(body.dayDate || istDateKey());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) {
    return NextResponse.json({ error: "dayDate must be YYYY-MM-DD" }, { status: 400 });
  }
  const [y, mo, d] = dayStr.split("-").map(Number);
  dayDate = new Date(Date.UTC(y, mo - 1, d));

  const requestedInAt = body.requestedInAt ? new Date(body.requestedInAt) : null;
  const requestedOutAt = body.requestedOutAt ? new Date(body.requestedOutAt) : null;
  if (requestType === "REGULARIZE" && !requestedInAt && !requestedOutAt) {
    return NextResponse.json({ error: "Regularization requires requestedInAt and/or requestedOutAt" }, { status: 400 });
  }

  const existing = await prisma.dutyAttendanceRequest.findFirst({
    where: {
      clinicId: me.clinicId,
      memberId: me.id,
      dayDate,
      requestType,
      status: "PENDING",
    },
  });
  if (existing) {
    return NextResponse.json({ error: "A pending request of this type already exists for that day" }, { status: 409 });
  }

  const row = await prisma.dutyAttendanceRequest.create({
    data: {
      clinicId: me.clinicId,
      memberId: me.id,
      doctorId: me.doctorId,
      requestType,
      status: "PENDING",
      dayDate,
      requestedInAt,
      requestedOutAt,
      reason,
    },
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "DUTY_REQUEST_CREATE",
    entity: "DutyAttendanceRequest",
    entityId: row.id,
    meta: { requestType, dayDate: dayStr, clinicId: me.clinicId },
    clinicId: me.clinicId,
  });

  return NextResponse.json({ ok: true, request: { id: row.id, status: row.status } });
}

/** PATCH — approve/reject (admin) or cancel (self pending) */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await ctx(session.doctorId);
  if (!me) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const action = String(body.action || "").toUpperCase(); // APPROVE | REJECT | CANCEL
  if (!id || !["APPROVE", "REJECT", "CANCEL"].includes(action)) {
    return NextResponse.json({ error: "id and action (APPROVE|REJECT|CANCEL) required" }, { status: 400 });
  }

  const row = await prisma.dutyAttendanceRequest.findFirst({
    where: { id, clinicId: me.clinicId },
  });
  if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (row.status !== "PENDING") {
    return NextResponse.json({ error: "Only pending requests can be updated" }, { status: 400 });
  }

  const role = normalizeClinicRole(me.role);
  const isAdmin = isDutyAdminRole(role);

  if (action === "CANCEL") {
    if (row.memberId !== me.id && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await prisma.dutyAttendanceRequest.update({
      where: { id },
      data: { status: "CANCELLED", reviewedAt: new Date(), reviewerDoctorId: session.doctorId },
    });
    await writeAudit({
      doctorId: session.doctorId,
      action: "DUTY_REQUEST_CANCEL",
      entity: "DutyAttendanceRequest",
      entityId: id,
      meta: { clinicId: me.clinicId },
      clinicId: me.clinicId,
    });
    return NextResponse.json({ ok: true, status: "CANCELLED" });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Only Owner/Admin/Manager can approve or reject" }, { status: 403 });
  }

  const reviewerNote = String(body.reviewerNote || "").slice(0, 500);
  const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

  await prisma.dutyAttendanceRequest.update({
    where: { id },
    data: {
      status: newStatus,
      reviewerDoctorId: session.doctorId,
      reviewerNote,
      reviewedAt: new Date(),
    },
  });

  // On approve REGULARIZE: append ADMIN correction punches (never delete originals)
  if (newStatus === "APPROVED" && row.requestType === "REGULARIZE") {
    if (row.requestedInAt) {
      await prisma.dutyAttendanceEvent.create({
        data: {
          clinicId: row.clinicId,
          memberId: row.memberId,
          doctorId: row.doctorId,
          type: "IN",
          source: "ADMIN",
          punchedAt: row.requestedInAt,
          withinGeofence: true,
          note: `REGULARIZATION APPROVED: ${row.reason}`.slice(0, 500),
          adminDoctorId: session.doctorId,
        },
      });
    }
    if (row.requestedOutAt) {
      await prisma.dutyAttendanceEvent.create({
        data: {
          clinicId: row.clinicId,
          memberId: row.memberId,
          doctorId: row.doctorId,
          type: "OUT",
          source: "ADMIN",
          punchedAt: row.requestedOutAt,
          withinGeofence: true,
          note: `REGULARIZATION APPROVED: ${row.reason}`.slice(0, 500),
          adminDoctorId: session.doctorId,
        },
      });
    }
  }

  await writeAudit({
    doctorId: session.doctorId,
    action: action === "APPROVE" ? "DUTY_REQUEST_APPROVE" : "DUTY_REQUEST_REJECT",
    entity: "DutyAttendanceRequest",
    entityId: id,
    meta: { clinicId: me.clinicId, requestType: row.requestType, reviewerNote },
    clinicId: me.clinicId,
  });

  return NextResponse.json({ ok: true, status: newStatus });
}
