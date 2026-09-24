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
    select: { id: true, clinicId: true, role: true },
  });
  if (!me) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const role = normalizeClinicRole(me.role);
  const isAdmin = isDutyAdminRole(role);
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 30)));
  const memberIdParam = url.searchParams.get("memberId");

  let memberId = me.id;
  if (memberIdParam && memberIdParam !== me.id) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Only Owner/Admin/Manager can view other staff history" }, { status: 403 });
    }
    const target = await prisma.clinicMember.findFirst({
      where: { id: memberIdParam, clinicId: me.clinicId, isActive: true },
      select: { id: true },
    });
    if (!target) return NextResponse.json({ error: "Staff not found in this hospital" }, { status: 404 });
    memberId = target.id;
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

  return NextResponse.json({ memberId, days, events });
}
