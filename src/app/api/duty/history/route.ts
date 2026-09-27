import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { isDutyAdminRole } from "@/lib/duty";

/** GET /api/duty/history?days=30&memberId= optional — own or admin-scoped history */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const m = await requireActiveClinicMembership(session.doctorId);
  if (!m?.clinicId || !m.membershipId) {
    return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  }

  const me = await prisma.clinicMember.findFirst({
    where: { id: m.membershipId, isActive: true },
    select: {
      id: true,
      clinicId: true,
      role: true,
      staffCode: true,
      doctor: { select: { name: true } },
    },
  });
  if (!me) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const role = normalizeClinicRole(me.role);
  const isAdmin = isDutyAdminRole(role);
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 30)));
  const memberIdParam = url.searchParams.get("memberId");

  let memberId = me.id;
  let staffMeta = {
    memberId: me.id,
    staffCode: me.staffCode || "",
    role: me.role,
    name: me.doctor.name,
  };

  if (memberIdParam && memberIdParam !== me.id) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Only Owner/Admin/Manager can view other staff history" }, { status: 403 });
    }
    const target = await prisma.clinicMember.findFirst({
      where: { id: memberIdParam, clinicId: me.clinicId, isActive: true },
      select: {
        id: true,
        staffCode: true,
        role: true,
        doctor: { select: { name: true } },
      },
    });
    if (!target) return NextResponse.json({ error: "Staff not found in this hospital" }, { status: 404 });
    memberId = target.id;
    staffMeta = {
      memberId: target.id,
      staffCode: target.staffCode || "",
      role: target.role,
      name: target.doctor.name,
    };
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const events = await prisma.dutyAttendanceEvent.findMany({
    where: { clinicId: me.clinicId, memberId, punchedAt: { gte: since } },
    orderBy: { punchedAt: "desc" },
    take: 500,
    select: {
      id: true,
      type: true,
      punchedAt: true,
      source: true,
      withinGeofence: true,
      note: true,
      lat: true,
      lng: true,
    },
  });

  // Pair IN/OUT into duty sessions for duration display
  const chronological = [...events].reverse();
  const sessions: Array<{
    inAt: string | null;
    outAt: string | null;
    durationMinutes: number | null;
    status: "ON_DUTY" | "COMPLETED" | "OPEN";
  }> = [];
  let openIn: Date | null = null;
  for (const ev of chronological) {
    if (ev.type === "IN") {
      openIn = ev.punchedAt;
    } else if (ev.type === "OUT" && openIn) {
      const mins = Math.max(0, Math.round((ev.punchedAt.getTime() - openIn.getTime()) / 60000));
      sessions.push({
        inAt: openIn.toISOString(),
        outAt: ev.punchedAt.toISOString(),
        durationMinutes: mins,
        status: "COMPLETED",
      });
      openIn = null;
    }
  }
  if (openIn) {
    sessions.push({
      inAt: openIn.toISOString(),
      outAt: null,
      durationMinutes: Math.max(0, Math.round((Date.now() - openIn.getTime()) / 60000)),
      status: "ON_DUTY",
    });
  }
  sessions.reverse();

  return NextResponse.json({
    memberId,
    staff: staffMeta,
    days,
    isAdmin,
    events,
    sessions,
  });
}
