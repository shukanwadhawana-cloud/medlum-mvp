import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { isDutyAdminRole, istDayStartUtc, formatIstTime } from "@/lib/duty";

/** GET /api/duty/admin — Admin/Manager attendance desk for today (clinic-scoped). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const m = await requireActiveClinicMembership(session.doctorId);
  if (!m?.clinicId || !m.membershipId) {
    return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });
  }

  const member = await prisma.clinicMember.findFirst({
    where: { id: m.membershipId, isActive: true },
    select: { id: true, clinicId: true, role: true },
  });
  if (!member) return NextResponse.json({ error: "No active clinic membership" }, { status: 403 });

  const role = normalizeClinicRole(member.role);
  if (!isDutyAdminRole(role)) {
    return NextResponse.json({ error: "Only Owner/Admin/Manager can view the attendance desk" }, { status: 403 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  let dayStart = istDayStartUtc();
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const [y, mo, d] = dateParam.split("-").map(Number);
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    dayStart = new Date(Date.UTC(y, mo - 1, d) - istOffsetMs);
  }
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const clinicId = member.clinicId;

  const [staff, events, leaveRequests] = await Promise.all([
    prisma.clinicMember.findMany({
      where: { clinicId, isActive: true },
      select: {
        id: true,
        staffCode: true,
        role: true,
        designation: true,
        department: true,
        doctor: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 300,
    }),
    prisma.dutyAttendanceEvent.findMany({
      where: { clinicId, punchedAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { punchedAt: "asc" },
      select: {
        id: true,
        memberId: true,
        type: true,
        punchedAt: true,
        source: true,
        withinGeofence: true,
        note: true,
      },
    }),
    prisma.dutyAttendanceRequest.findMany({
      where: {
        clinicId,
        dayDate: dayStart,
        requestType: "LEAVE",
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: { memberId: true, status: true, requestType: true },
    }).catch(() => [] as { memberId: string; status: string; requestType: string }[]),
  ]);

  type StaffRow = {
    memberId: string;
    name: string;
    staffCode: string;
    role: string;
    designation: string;
    department: string;
    inTime: string | null;
    outTime: string | null;
    status: "ON_DUTY" | "OFF_DUTY" | "NOT_PUNCHED" | "ON_LEAVE" | "MISSING_OUT";
    sourceLast: string | null;
    outsideFence: boolean;
  };

  const leaveSet = new Set(leaveRequests.filter((r) => r.status === "APPROVED").map((r) => r.memberId));
  const pendingLeaveSet = new Set(leaveRequests.filter((r) => r.status === "PENDING").map((r) => r.memberId));

  const byMember = new Map<string, typeof events>();
  for (const ev of events) {
    const list = byMember.get(ev.memberId) || [];
    list.push(ev);
    byMember.set(ev.memberId, list);
  }

  const rows: StaffRow[] = staff.map((s) => {
    const list = byMember.get(s.id) || [];
    const ins = list.filter((e) => e.type === "IN");
    const outs = list.filter((e) => e.type === "OUT");
    const firstIn = ins[0] || null;
    const lastOut = outs.length ? outs[outs.length - 1] : null;
    const last = list.length ? list[list.length - 1] : null;

    let status: StaffRow["status"] = "NOT_PUNCHED";
    if (leaveSet.has(s.id)) status = "ON_LEAVE";
    else if (last?.type === "IN") status = "ON_DUTY";
    else if (firstIn && lastOut) status = "OFF_DUTY";
    else if (firstIn && !lastOut) status = "MISSING_OUT";

    return {
      memberId: s.id,
      name: s.doctor.name,
      staffCode: s.staffCode || "",
      role: s.role,
      designation: s.designation || "",
      department: s.department || "",
      inTime: firstIn ? formatIstTime(firstIn.punchedAt) : null,
      outTime: lastOut ? formatIstTime(lastOut.punchedAt) : null,
      status,
      sourceLast: last?.source || null,
      outsideFence: list.some((e) => e.withinGeofence === false),
    };
  });

  const total = rows.length;
  const onDuty = rows.filter((r) => r.status === "ON_DUTY").length;
  const present = rows.filter((r) => r.status === "ON_DUTY" || r.status === "OFF_DUTY" || r.status === "MISSING_OUT").length;
  const notPunched = rows.filter((r) => r.status === "NOT_PUNCHED").length;
  const onLeave = rows.filter((r) => r.status === "ON_LEAVE").length;
  const missingOut = rows.filter((r) => r.status === "MISSING_OUT").length;
  const exceptions = rows.filter((r) => r.outsideFence || r.status === "MISSING_OUT").length;

  let pendingReg = 0;
  try {
    pendingReg = await prisma.dutyAttendanceRequest.count({ where: { clinicId, status: "PENDING" } });
  } catch {
    pendingReg = 0;
  }

  return NextResponse.json({
    clinicId,
    dayStart: dayStart.toISOString(),
    kpis: {
      totalActiveStaff: total,
      present,
      onDuty,
      notPunched,
      onLeave,
      missingOut,
      exceptions,
      pendingRequests: pendingReg,
      pendingLeave: pendingLeaveSet.size,
    },
    staff: rows,
  });
}
