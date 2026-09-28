import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";
import { assertJsonObjectSize, type NormalizedJsonObject } from "@/lib/json-input";

const MANAGERS = ["Owner","Admin","Manager"];

async function ctx() {
  const session = await getSession();
  if (!session) return null;
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return null;
  return { session, membership, role: normalizeClinicRole(membership.role) };
}

export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGERS.includes(c.role)) return NextResponse.json({ error: "People access is restricted to facility management." }, { status: 403 });
  const url = new URL(req.url);
  const module = url.searchParams.get("module") || "";
  const memberId = url.searchParams.get("memberId") || undefined;
  const allowed = ["leave","shifts","recruitment","onboarding","payroll","expenses","performance","training","discipline","compensation"];
  if (module && !allowed.includes(module)) return NextResponse.json({ error: "Unknown People module." }, { status: 400 });
  const records = await prisma.workforceRecord.findMany({
    where: { clinicId: c.membership.clinicId, ...(module ? { module } : {}), ...(memberId ? { memberId } : {}) },
    orderBy: { createdAt: "desc" }, take: 500,
    include: { member: { select: { id:true, staffCode:true, role:true, designation:true, department:true, doctor:{select:{name:true,email:true,phone:true}} } } }
  });
  return NextResponse.json({ clinicId: c.membership.clinicId, records });
}

export async function POST(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGERS.includes(c.role)) return NextResponse.json({ error: "Only Owner, Admin or Manager can manage People records." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const module = String(body.module || "");
  const recordType = String(body.recordType || "").trim();
  const title = String(body.title || "").trim();
  const status = String(body.status || "DRAFT").trim().toUpperCase();
  let data: NormalizedJsonObject;
  try { data = assertJsonObjectSize(body.data); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid record details." }, { status: 400 });
  }
  const memberId = body.memberId ? String(body.memberId) : null;
  const allowed = ["leave","shifts","recruitment","onboarding","payroll","expenses","performance","training","discipline","compensation"];
  if (!allowed.includes(module) || !recordType || !title) return NextResponse.json({ error: "module, recordType and title are required." }, { status: 400 });
  if (memberId) {
    const member = await prisma.clinicMember.findFirst({ where:{id:memberId, clinicId:c.membership.clinicId}, select:{id:true} });
    if (!member) return NextResponse.json({ error:"Staff member is not part of the selected facility." }, {status:404});
  }
  const record = await prisma.workforceRecord.create({
    data:{ clinicId:c.membership.clinicId, memberId, module, recordType, status, title, data, createdBy:c.session.doctorId,
      startAt: body.startAt ? new Date(body.startAt) : null, endAt: body.endAt ? new Date(body.endAt) : null }
  });
  await writeAudit({doctorId:c.session.doctorId, action:"PEOPLE_RECORD_CREATED", entity:"WorkforceRecord", entityId:record.id, clinicId:c.membership.clinicId, meta:{module,recordType,status,memberId}});
  return NextResponse.json({success:true,record});
}

export async function PATCH(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGERS.includes(c.role)) return NextResponse.json({ error: "Only Owner, Admin or Manager can update People records." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({error:"Record id is required."},{status:400});
  const existing = await prisma.workforceRecord.findFirst({where:{id,clinicId:c.membership.clinicId}});
  if (!existing) return NextResponse.json({error:"Record not found in selected facility."},{status:404});
  let data: NormalizedJsonObject = (existing.data && typeof existing.data === "object" && !Array.isArray(existing.data)
    ? (existing.data as NormalizedJsonObject)
    : {});
  if (body.data !== undefined) {
    try { data = assertJsonObjectSize(body.data); } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid record details." }, { status: 400 });
    }
  }
  const record = await prisma.workforceRecord.update({where:{id},data:{
    status: body.status ? String(body.status).toUpperCase() : existing.status,
    title: body.title ? String(body.title).trim() : existing.title,
    data,
    startAt: body.startAt === null ? null : body.startAt ? new Date(body.startAt) : existing.startAt,
    endAt: body.endAt === null ? null : body.endAt ? new Date(body.endAt) : existing.endAt,
  }});
  await writeAudit({doctorId:c.session.doctorId,action:"PEOPLE_RECORD_UPDATED",entity:"WorkforceRecord",entityId:id,clinicId:c.membership.clinicId,meta:{module:existing.module,status:record.status}});
  return NextResponse.json({success:true,record});
}
