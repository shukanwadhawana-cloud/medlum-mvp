import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { evaluateGeofence, isDutyAdminRole, type DutyPunchType } from "@/lib/duty";
import { isSaniddhiConfigured, pushPunchToSaniddhi } from "@/lib/saniddhi";

async function membershipCtx(doctorId: string) {
  const m = await requireActiveClinicMembership(doctorId);
  if (!m?.clinicId) return null;
  const row = await prisma.clinicMember.findFirst({
    where: { id: m.membershipId, isActive: true },
    select: {
      id: true,
      clinicId: true,
      doctorId: true,
      role: true,
      staffCode: true,
      doctor: { select: { name: true, email: true } },
      clinic: {
        select: {
          id: true,
          name: true,
          dutyLat: true,
          dutyLng: true,
          dutyRadiusMeters: true,
          dutyEnabled: true,
        },
      },
    },
  });
  return row;
}

/** GET — own status + today's clinic board (admin sees all; staff sees self). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await membershipCtx(session.doctorId);
  if (!ctx) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const role = normalizeClinicRole(ctx.role);
  const isAdmin = isDutyAdminRole(role);

  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(Date.now() + istOffsetMs);
  const dayStartUtc = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs);

  const events = await prisma.dutyAttendanceEvent.findMany({
    where: {
      clinicId: ctx.clinicId,
      punchedAt: { gte: dayStartUtc },
      ...(isAdmin ? {} : { memberId: ctx.id }),
    },
    orderBy: { punchedAt: "desc" },
    take: 200,
    select: {
      id: true,
      type: true,
      punchedAt: true,
      source: true,
      withinGeofence: true,
      note: true,
      memberId: true,
      doctorId: true,
      lat: true,
      lng: true,
      saniddhiRef: true,
    },
  });

  const lastSelf = await prisma.dutyAttendanceEvent.findFirst({
    where: { clinicId: ctx.clinicId, memberId: ctx.id },
    orderBy: { punchedAt: "desc" },
    select: { type: true, punchedAt: true },
  });

  const members = isAdmin
    ? await prisma.clinicMember.findMany({
        where: { clinicId: ctx.clinicId, isActive: true },
        select: {
          id: true,
          staffCode: true,
          role: true,
          doctor: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 200,
      })
    : [];

  return NextResponse.json({
    clinic: {
      id: ctx.clinic.id,
      name: ctx.clinic.name,
      dutyEnabled: ctx.clinic.dutyEnabled,
      dutyLat: ctx.clinic.dutyLat,
      dutyLng: ctx.clinic.dutyLng,
      dutyRadiusMeters: ctx.clinic.dutyRadiusMeters,
    },
    me: {
      memberId: ctx.id,
      staffCode: ctx.staffCode,
      role,
      name: ctx.doctor.name,
      lastPunch: lastSelf,
      expectedNext: lastSelf?.type === "IN" ? "OUT" : "IN",
    },
    isAdmin,
    saniddhiConfigured: isSaniddhiConfigured(),
    todayEvents: events,
    members: members.map((m) => ({
      memberId: m.id,
      staffCode: m.staffCode,
      role: m.role,
      name: m.doctor.name,
    })),
  });
}

/** POST — self or admin punch IN/OUT with optional geofence. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await membershipCtx(session.doctorId);
  if (!ctx) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const type = String(body.type || "").toUpperCase() as DutyPunchType;
  if (type !== "IN" && type !== "OUT") {
    return NextResponse.json({ error: "type must be IN or OUT" }, { status: 400 });
  }

  const role = normalizeClinicRole(ctx.role);
  const isAdmin = isDutyAdminRole(role);
  const targetMemberId = body.memberId ? String(body.memberId) : ctx.id;
  const isSelf = targetMemberId === ctx.id;
  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: "Only Owner/Admin/Manager can mark attendance for others" }, { status: 403 });
  }

  let target = ctx;
  if (!isSelf) {
    const other = await prisma.clinicMember.findFirst({
      where: { id: targetMemberId, clinicId: ctx.clinicId, isActive: true },
      select: {
        id: true,
        clinicId: true,
        doctorId: true,
        role: true,
        staffCode: true,
        doctor: { select: { name: true, email: true } },
        clinic: {
          select: {
            id: true,
            name: true,
            dutyLat: true,
            dutyLng: true,
            dutyRadiusMeters: true,
            dutyEnabled: true,
          },
        },
      },
    });
    if (!other) return NextResponse.json({ error: "Target staff not found in this hospital" }, { status: 404 });
    target = other;
  }

  const lat = body.lat != null ? Number(body.lat) : null;
  const lng = body.lng != null ? Number(body.lng) : null;
  const accuracyMeters = body.accuracyMeters != null ? Number(body.accuracyMeters) : null;
  const note = String(body.note || "").slice(0, 500);

  const geo = evaluateGeofence(
    {
      enabled: Boolean(target.clinic.dutyEnabled),
      lat: target.clinic.dutyLat,
      lng: target.clinic.dutyLng,
      radiusMeters: target.clinic.dutyRadiusMeters || 200,
    },
    lat,
    lng
  );
  if (!geo.ok) {
    return NextResponse.json({ error: geo.error, distanceMeters: geo.distanceMeters }, { status: 400 });
  }

  const event = await prisma.dutyAttendanceEvent.create({
    data: {
      clinicId: target.clinicId,
      memberId: target.id,
      doctorId: target.doctorId,
      type,
      source: isSelf ? "SELF" : "ADMIN",
      lat,
      lng,
      accuracyMeters,
      withinGeofence: geo.within,
      note,
      adminDoctorId: isSelf ? null : session.doctorId,
    },
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: isSelf ? "DUTY_SELF_PUNCH" : "DUTY_ADMIN_PUNCH",
    entityType: "DutyAttendanceEvent",
    entityId: event.id,
    meta: { type, memberId: target.id, clinicId: target.clinicId, withinGeofence: geo.within },
  });

  let saniddhiRef = "";
  const sync = await pushPunchToSaniddhi({
    clinicId: target.clinicId,
    clinicName: target.clinic.name,
    staffCode: target.staffCode || target.doctor.email,
    staffName: target.doctor.name,
    type,
    punchedAt: event.punchedAt.toISOString(),
    lat,
    lng,
    source: isSelf ? "SELF" : "ADMIN",
    medlumEventId: event.id,
  });
  if (sync.synced) {
    saniddhiRef = sync.ref;
    await prisma.dutyAttendanceEvent.update({
      where: { id: event.id },
      data: { saniddhiSyncAt: new Date(), saniddhiRef },
    });
  }

  return NextResponse.json({
    ok: true,
    event: { id: event.id, type, punchedAt: event.punchedAt, withinGeofence: geo.within, saniddhiRef },
    saniddhi: sync,
  });
}

/** PATCH — configure hospital geofence (Owner/Admin/Manager). */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await membershipCtx(session.doctorId);
  if (!ctx) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  const role = normalizeClinicRole(ctx.role);
  if (!isDutyAdminRole(role)) {
    return NextResponse.json({ error: "Only Owner/Admin/Manager can configure geofence" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const dutyEnabled = Boolean(body.dutyEnabled);
  const dutyLat = body.dutyLat != null ? Number(body.dutyLat) : null;
  const dutyLng = body.dutyLng != null ? Number(body.dutyLng) : null;
  let dutyRadiusMeters = body.dutyRadiusMeters != null ? Number(body.dutyRadiusMeters) : 200;
  if (!Number.isFinite(dutyRadiusMeters)) dutyRadiusMeters = 200;
  dutyRadiusMeters = Math.max(50, Math.min(5000, Math.round(dutyRadiusMeters)));

  if (dutyEnabled && (dutyLat == null || dutyLng == null || Number.isNaN(dutyLat) || Number.isNaN(dutyLng))) {
    return NextResponse.json({ error: "Enable geofence requires dutyLat and dutyLng" }, { status: 400 });
  }

  await prisma.clinic.update({
    where: { id: ctx.clinicId },
    data: { dutyEnabled, dutyLat, dutyLng, dutyRadiusMeters },
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "DUTY_GEOFENCE_CONFIG",
    entityType: "Clinic",
    entityId: ctx.clinicId,
    meta: { dutyEnabled, dutyLat, dutyLng, dutyRadiusMeters },
  });

  return NextResponse.json({ ok: true, dutyEnabled, dutyLat, dutyLng, dutyRadiusMeters });
}
