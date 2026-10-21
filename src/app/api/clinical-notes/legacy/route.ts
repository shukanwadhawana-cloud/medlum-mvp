import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { hashClinicalNote } from "@/lib/clinical-signing";

function parseMeta(value: string | null | undefined) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success:false, error:"Unauthorized" }, { status:401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ success:false, error:"No active clinic membership" }, { status:403 });
  try {
    const body = await req.json();
    const auditId = String(body.auditId || "").trim();
    if (!auditId.startsWith("legacy-audit-")) return NextResponse.json({success:false,error:"Invalid legacy note reference"},{status:400});
    const logId = auditId.slice("legacy-audit-".length);
    const result = await prisma.$transaction(async tx => {
      const log = await tx.auditLog.findFirst({where:{id:logId,entity:"ClinicalNote",doctorId:session.doctorId}});
      if (!log) return {status:404,body:{success:false,error:"Legacy note not found or you are not its author"}};
      const meta = parseMeta(log.meta);
      const patientId = String(meta.patientId || log.entityId || "");
      const noteType = String(meta.noteType || "").trim();
      const title = String(meta.title || "").trim();
      const content = String(meta.content || "");
      const status = String(meta.status || "DRAFT");
      if (!patientId || !noteType || !title || !content.trim()) return {status:400,body:{success:false,error:"Legacy note is missing required fields"}};
      if (status !== "DRAFT") return {status:409,body:{success:false,error:"Only legacy drafts can be activated. Submitted or signed records must retain their original verification history."}};
      const patient = await tx.patient.findFirst({where:{id:patientId,clinicId:membership.clinicId,deletedAt:null},select:{id:true}});
      if (!patient) return {status:404,body:{success:false,error:"Patient not found in your active clinic"}};
      const existing = await tx.clinicalNote.findFirst({where:{clinicId:membership.clinicId,patientId,authorDoctorId:session.doctorId,noteType,title,content,status:"DRAFT"}});
      if (existing) return {status:200,body:{success:true,noteId:existing.id,alreadyActivated:true}};
      const now = new Date();
      const note = await tx.clinicalNote.create({data:{clinicId:membership.clinicId,patientId,authorDoctorId:session.doctorId,authorRole:String(meta.authorRole || membership.role || "Clinician"),noteType,title,content,status:"DRAFT",version:1,contentHash:hashClinicalNote(content,1)}});
      await tx.clinicalNoteVersion.create({data:{clinicalNoteId:note.id,clinicId:membership.clinicId,version:1,title,noteType,content,contentHash:hashClinicalNote(content,1),event:"LEGACY_DRAFT_ACTIVATED",createdByDoctorId:session.doctorId,createdAt:now}});
      await tx.auditLog.create({data:{doctorId:session.doctorId,action:"LEGACY_DRAFT_ACTIVATED",entity:"ClinicalNote",entityId:note.id,meta:JSON.stringify({clinicId:membership.clinicId,patientId,sourceAuditId:log.id,source:"legacy-audit-log"})}});
      return {status:200,body:{success:true,noteId:note.id}};
    });
    return NextResponse.json(result.body,{status:result.status});
  } catch (error) {
    console.error("legacy clinical note activation",error);
    return NextResponse.json({success:false,error:"Could not activate legacy draft"},{status:500});
  }
}
