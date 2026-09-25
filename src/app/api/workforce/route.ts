import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { requireActiveClinicMembership, normalizeClinicRole } from "@/lib/clinic-auth";

const ADMIN_ROLES = ["Owner","Admin","Manager"];
const SELF_SERVICE_MODULES = ["Leave","Expenses","Performance","Learning","Career & Skills","Attendance"];

async function ctx() {
  const session = await getSession();
  if (!session) return null;
  const m = await requireActiveClinicMembership(session.doctorId);
  if (!m?.clinicId) return null;
  const member = await prisma.clinicMember.findFirst({
    where: { id: m.membershipId, isActive: true, clinic: { isActive: true } },
    select: { id:true, clinicId:true, doctorId:true, role:true, staffCode:true, doctor:{select:{name:true,email:true}}, clinic:{select:{id:true,name:true}} }
  });
  return member ? { session, member, role: normalizeClinicRole(member.role) } : null;
}

function cleanData(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const text = JSON.stringify(value);
  if (text.length > 20000) throw new Error("Record details are too large.");
  return value as Record<string, unknown>;
}

export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({error:"Unauthorized or no active clinic membership"},{status:403});
  const url = new URL(req.url);
  const module = url.searchParams.get("module") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const memberId = url.searchParams.get("memberId") || undefined;
  const admin = ADMIN_ROLES.includes(c.role);
  const rows = await prisma.workforceRecord.findMany({
    where: {
      clinicId: c.member.clinicId,
      ...(module ? {module} : {}),
      ...(status ? {status} : {}),
      ...(admin ? (memberId ? {memberId} : {}) : {memberId:c.member.id}),
    },
    orderBy: {createdAt:"desc"},
    take: 500,
    include: {member:{select:{id:true,staffCode:true,role:true,designation:true,department:true,doctor:{select:{name:true,email:true}}}}}
  });
  const counts = rows.reduce<Record<string,number>>((a,r)=>{a[r.module]=(a[r.module]||0)+1; return a;},{});
  return NextResponse.json({clinic:c.member.clinic, isAdmin:admin, me:{memberId:c.member.id,staffCode:c.member.staffCode,name:c.member.doctor.name,role:c.role}, records:rows, counts});
}

export async function POST(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({error:"Unauthorized or no active clinic membership"},{status:403});
  const body = await req.json().catch(()=>({}));
  const module = typeof body.module==="string" ? body.module.trim() : "";
  const recordType = typeof body.recordType==="string" ? body.recordType.trim() : "";
  const title = typeof body.title==="string" ? body.title.trim() : "";
  const status = typeof body.status==="string" ? body.status.trim() : "DRAFT";
  const requestedMemberId = typeof body.memberId==="string" ? body.memberId : c.member.id;
  const admin = ADMIN_ROLES.includes(c.role);
  if (!module || !recordType || !title) return NextResponse.json({error:"module, recordType and title are required"},{status:400});
  if (!admin && (!SELF_SERVICE_MODULES.includes(module) || requestedMemberId!==c.member.id)) {
    return NextResponse.json({error:"This workforce action requires an Owner/Admin/Manager or self-service access."},{status:403});
  }
  let memberId: string | null = requestedMemberId || null;
  if (memberId) {
    const target = await prisma.clinicMember.findFirst({where:{id:memberId,clinicId:c.member.clinicId,isActive:true},select:{id:true}});
    if (!target) return NextResponse.json({error:"Staff member is not active in this clinic."},{status:404});
  }
  let data: Record<string,unknown>;
  try { data=cleanData(body.data); } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Invalid data"},{status:400}); }
  const row=await prisma.workforceRecord.create({
    data:{clinicId:c.member.clinicId,memberId,module,recordType,status,title,data,startAt:body.startAt?new Date(body.startAt):null,endAt:body.endAt?new Date(body.endAt):null,createdBy:c.session.doctorId}
  });
  await writeAudit({doctorId:c.session.doctorId,action:"WORKFORCE_RECORD_CREATED",entity:"WorkforceRecord",entityId:row.id,clinicId:c.member.clinicId,meta:{module,recordType,status,memberId}});
  return NextResponse.json({ok:true,record:row},{status:201});
}

export async function PATCH(req: Request) {
  const c = await ctx();
  if (!c || !ADMIN_ROLES.includes(c.role)) return NextResponse.json({error:"Only Owner/Admin/Manager can update workforce records."},{status:403});
  const body=await req.json().catch(()=>({}));
  const id=typeof body.id==="string"?body.id:"";
  if(!id) return NextResponse.json({error:"Record id is required"},{status:400});
  const existing=await prisma.workforceRecord.findFirst({where:{id,clinicId:c.member.clinicId}});
  if(!existing) return NextResponse.json({error:"Workforce record not found"},{status:404});
  let data=existing.data as Record<string,unknown>;
  if(body.data!==undefined){try{data=cleanData(body.data);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Invalid data"},{status:400});}}
  const row=await prisma.workforceRecord.update({where:{id},data:{
    status:typeof body.status==="string"?body.status:existing.status,
    title:typeof body.title==="string"?body.title.trim()||existing.title:existing.title,
    data,
    startAt:body.startAt!==undefined?(body.startAt?new Date(body.startAt):null):existing.startAt,
    endAt:body.endAt!==undefined?(body.endAt?new Date(body.endAt):null):existing.endAt,
  }});
  await writeAudit({doctorId:c.session.doctorId,action:"WORKFORCE_RECORD_UPDATED",entity:"WorkforceRecord",entityId:id,clinicId:c.member.clinicId,meta:{module:existing.module,status:row.status}});
  return NextResponse.json({ok:true,record:row});
}
