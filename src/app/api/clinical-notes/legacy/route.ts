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

      // A legacy audit entry is a stable source identity. Once linked to a
      // canonical ClinicalNote, later clicks must reuse that identity rather
      // than creating another note after the first one is cancelled.
      const activationLogs = await tx.auditLog.findMany({
        where:{doctorId:session.doctorId,entity:"ClinicalNote",action:"LEGACY_DRAFT_ACTIVATED"},
        orderBy:{createdAt:"desc"},take:1000,select:{entityId:true,meta:true},
      });
      const priorActivation = activationLogs.find((entry:any) => String(parseMeta(entry.meta).sourceAuditId||"") === log.id);
      if (priorActivation?.entityId) {
        const linked = await tx.clinicalNote.findFirst({
          where:{id:priorActivation.entityId,clinicId:membership.clinicId,patientId},
          select:{id:true,status:true},
        });
        if (!linked) return {status:409,body:{success:false,error:"This legacy draft is already linked to a note that is no longer available. It will not be recreated."}};
        if (linked.status === "CANCELLED") {
          return {status:409,body:{success:false,error:"This legacy draft was already cancelled. It cannot be reactivated; its cancellation history is retained."}};
        }
        if (linked.status !== "DRAFT") {
          return {status:409,body:{success:false,error:"This legacy draft has already moved to another workflow state and will not be recreated."}};
        }
        return {status:200,body:{success:true,noteId:linked.id,alreadyActivated:true}};
      }

      const existing = await tx.clinicalNote.findFirst({where:{clinicId:membership.clinicId,patientId,authorDoctorId:session.doctorId,noteType,title,content,status:"DRAFT"}});
      if (existing) {
        // Link the legacy source even when an equivalent draft pre-existed.
        // Without this audit link, a later cancellation leaves the old legacy
        // row visible, allowing the same source to be activated/cancelled again.
        await tx.auditLog.create({data:{doctorId:session.doctorId,action:"LEGACY_DRAFT_ACTIVATED",entity:"ClinicalNote",entityId:existing.id,meta:JSON.stringify({clinicId:membership.clinicId,patientId,sourceAuditId:log.id,source:"legacy-audit-log",alreadyActivated:true})}});
        return {status:200,body:{success:true,noteId:existing.id,alreadyActivated:true}};
      }

      // If the original legacy timestamp matches a cancelled canonical copy,
      // link the source to it instead of producing a second cancelled row.
      const sourceTime = new Date(log.createdAt).getTime();
      const cancelledMatches = await tx.clinicalNote.findMany({
        where:{clinicId:membership.clinicId,patientId,authorDoctorId:session.doctorId,noteType,title,content,status:"CANCELLED"},
        orderBy:{createdAt:"desc"},take:20,select:{id:true,createdAt:true},
      });
      const priorCancelled = cancelledMatches.find((candidate:any) => {
        const createdAt = new Date(candidate.createdAt).getTime();
        return Number.isFinite(sourceTime) && Number.isFinite(createdAt) && Math.abs(createdAt-sourceTime)<120000;
      });
      if (priorCancelled) {
        await tx.auditLog.create({data:{doctorId:session.doctorId,action:"LEGACY_DRAFT_ACTIVATED",entity:"ClinicalNote",entityId:priorCancelled.id,meta:JSON.stringify({clinicId:membership.clinicId,patientId,sourceAuditId:log.id,source:"legacy-audit-log",alreadyCancelled:true})}});
        return {status:409,body:{success:false,error:"This legacy draft was already cancelled. It will not be recreated; the original cancellation remains in history."}};
      }
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
