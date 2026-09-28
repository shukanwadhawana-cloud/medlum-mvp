import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { evaluateGeofence, isDutyAdminRole, type DutyPunchType } from "@/lib/duty";
import { isSaniddhiConfigured, pushPunchToSaniddhi } from "@/lib/saniddhi";

async function membershipCtx(doctorId: string, clinicId?: string) {
  const m = await requireActiveClinicMembership(doctorId);
  const selectedClinicId = clinicId || m?.clinicId;
  if (!m?.clinicId) return null;
  const row = await prisma.clinicMember.findFirst({
    where: { doctorId, clinicId: selectedClinicId, isActive: true, clinic: { isActive: true } },
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
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requestedClinicId = new URL(req.url).searchParams.get("clinicId") || undefined;
  const ctx = await membershipCtx(session.doctorId, requestedClinicId);
  if (!ctx) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const role = normalizeClinicRole(ctx.role);
  const isAdmin = isDutyAdminRole(role);
  const availableClinics = await prisma.clinicMember.findMany({
    where: { doctorId: session.doctorId, isActive: true, clinic: { isActive: true } },
    select: { clinicId: true, role: true, clinic: { select: { id: true, name: true, address: true, dutyEnabled: true, dutyLat: true, dutyLng: true, dutyRadiusMeters: true } } },
    orderBy: { createdAt: "asc" },
  });

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
      member: {
        select: {
          staffCode: true,
          role: true,
          doctor: { select: { name: true } },
        },
      },
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

  let onDutyBoard: Array<{
    memberId: string;
    staffCode: string;
    role: string;
    name: string;
    dutyStartedAt: string;
    elapsedMinutes: number;
  }> = [];
  if (isAdmin && events.length > 0) {
    const lastByMember = new Map<string, (typeof events)[0]>();
    for (const ev of events) {
      if (!lastByMember.has(ev.memberId)) lastByMember.set(ev.memberId, ev);
    }
    for (const [memberId, ev] of lastByMember) {
      if (ev.type !== "IN") continue;
      const m = members.find((x) => x.id === memberId);
      onDutyBoard.push({
        memberId,
        staffCode: m?.staffCode || (ev as any).member?.staffCode || "",
        role: m?.role || (ev as any).member?.role || "",
        name: m?.doctor.name || (ev as any).member?.doctor?.name || "Staff",
        dutyStartedAt: ev.punchedAt.toISOString(),
        elapsedMinutes: Math.max(0, Math.floor((Date.now() - new Date(ev.punchedAt).getTime()) / 60000)),
      });
    }
  }

  return NextResponse.json({
    clinics: availableClinics.map((m) => ({ id: m.clinic.id, name: m.clinic.name, address: m.clinic.address, role: normalizeClinicRole(m.role), dutyEnabled: m.clinic.dutyEnabled, dutyLat: m.clinic.dutyLat, dutyLng: m.clinic.dutyLng, dutyRadiusMeters: m.clinic.dutyRadiusMeters })),
    selectedClinicId: ctx.clinic.id,
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
      onDuty: lastSelf?.type === "IN",
      dutyStartedAt: lastSelf?.type === "IN" ? lastSelf.punchedAt : null,
      elapsedMinutes:
        lastSelf?.type === "IN" && lastSelf.punchedAt
          ? Math.max(0, Math.round((Date.now() - new Date(lastSelf.punchedAt).getTime()) / 60000))
          : null,
      status: lastSelf?.type === "IN" ? "ON_DUTY" : "OFF_DUTY",
    },
    isAdmin,
    saniddhiConfigured: isSaniddhiConfigured(),
    todayEvents: events.map((ev) => ({
      id: ev.id,
      type: ev.type,
      punchedAt: ev.punchedAt,
      source: ev.source,
      withinGeofence: ev.withinGeofence,
      note: ev.note,
      memberId: ev.memberId,
      doctorId: ev.doctorId,
      lat: ev.lat,
      lng: ev.lng,
      saniddhiRef: ev.saniddhiRef,
      staffCode: (ev as any).member?.staffCode || "",
      role: (ev as any).member?.role || "",
      staffName: (ev as any).member?.doctor?.name || "",
    })),
    members: members.map((m) => ({
      memberId: m.id,
      staffCode: m.staffCode,
      role: m.role,
      name: m.doctor.name,
    })),
    onDutyBoard,
    todayCount: events.length,
  });
}

/** POST — self or admin punch IN/OUT with optional geofence. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const requestedClinicId = body.clinicId ? String(body.clinicId) : undefined;
  const ctx = await membershipCtx(session.doctorId, requestedClinicId);
  if (!ctx) return NextResponse.json({ error: "No active clinic membership for the selected hospital" }, { status: 403 });
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

  // Prevent nonsensical duplicate active punches (server is source of truth).
  const lastPunch = await prisma.dutyAttendanceEvent.findFirst({
    where: { clinicId: target.clinicId, memberId: target.id },
    orderBy: { punchedAt: "desc" },
    select: { type: true, punchedAt: true, id: true },
  });
  if (type === "IN" && lastPunch?.type === "IN") {
    return NextResponse.json(
      {
        error: "Already on duty. Punch OUT before starting another duty.",
        lastPunch: { type: lastPunch.type, punchedAt: lastPunch.punchedAt, id: lastPunch.id },
      },
      { status: 409 }
    );
  }
  if (type === "OUT" && (!lastPunch || lastPunch.type === "OUT")) {
    return NextResponse.json(
      {
        error: "Not currently on duty. Punch IN before ending duty.",
        lastPunch: lastPunch
          ? { type: lastPunch.type, punchedAt: lastPunch.punchedAt, id: lastPunch.id }
          : null,
      },
      { status: 409 }
    );
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
    entity: "DutyAttendanceEvent",
    entityId: event.id,
    meta: { type, memberId: target.id, clinicId: target.clinicId, withinGeofence: geo.within },
    clinicId: target.clinicId,
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
  const requestedClinicId = new URL(req.url).searchParams.get("clinicId") || undefined;
  const ctx = await membershipCtx(session.doctorId, requestedClinicId);
  if (!ctx) return NextResponse.json({ error: "No active clinic membership for the selected hospital" }, { status: 403 });
  const role = normalizeClinicRole(ctx.role);
  if (!isDutyAdminRole(role)) {
    return NextResponse.json({ error: "Only Owner/Admin/Manager can configure geofence" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const dutyEnabled = Boolean(body.dutyEnabled);
  const dutyLat = body.dutyLat != null ? Number(body.dutyLat) : null;
  const dutyLng = body.dutyLng != null ? Number(body.dutyLng) : null;
  const currentLat = body.currentLat != null ? Number(body.currentLat) : null;
  const currentLng = body.currentLng != null ? Number(body.currentLng) : null;
  let dutyRadiusMeters = body.dutyRadiusMeters != null ? Number(body.dutyRadiusMeters) : 200;
  if (!Number.isFinite(dutyRadiusMeters)) dutyRadiusMeters = 200;
  dutyRadiusMeters = Math.max(100, Math.min(300, Math.round(dutyRadiusMeters)));

  if (dutyEnabled && (dutyLat == null || dutyLng == null || Number.isNaN(dutyLat) || Number.isNaN(dutyLng))) {
    return NextResponse.json({ error: "Enable geofence requires a valid hospital location." }, { status: 400 });
  }
  if (dutyEnabled && (currentLat == null || currentLng == null || Number.isNaN(currentLat) || Number.isNaN(currentLng))) {
    return NextResponse.json({ error: "Hospital geofence can only be configured while you are physically at the hospital. Turn on Location Services and use your current GPS location." }, { status: 400 });
  }
  if (dutyEnabled) {
    const setupCheck = evaluateGeofence(
      { enabled: true, lat: dutyLat, lng: dutyLng, radiusMeters: 300 },
      currentLat,
      currentLng,
    );
    if (!setupCheck.within) {
      return NextResponse.json({ error: setupCheck.error || "You must be within 300 m of the hospital to configure its geofence." }, { status: 403 });
    }
  }

  await prisma.clinic.update({
    where: { id: ctx.clinicId },
    data: { dutyEnabled, dutyLat, dutyLng, dutyRadiusMeters },
  });

  await writeAudit({
    doctorId: session.doctorId,
    action: "DUTY_GEOFENCE_CONFIG",
    entity: "Clinic",
    entityId: ctx.clinicId,
    meta: { dutyEnabled, dutyLat, dutyLng, dutyRadiusMeters, configuredFromLat: currentLat, configuredFromLng: currentLng },
    clinicId: ctx.clinicId,
  });

  return NextResponse.json({ ok: true, dutyEnabled, dutyLat, dutyLng, dutyRadiusMeters });
}
