import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireActiveClinicMembership } from "@/lib/clinic-auth";
import { writeAudit } from "@/lib/audit";

const cancellable = new Set([
  "ClinicalNote","Encounter","Prescription","LabOrder","DiagnosticOrder",
  "MedicationAdministration","Appointment","EmergencyCase","BloodRequest",
  "InsuranceClaim","InsurancePolicy","MedicalDocument"
]);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success:false, error:"Unauthorized" }, { status:401 });
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership) return NextResponse.json({ success:false, error:"No active clinic membership" }, { status:403 });
  try {
    const body = await req.json();
    const entity = String(body.entity || "").trim();
    const id = String(body.id || "").trim();
    const reason = String(body.reason || "").trim();
    if (!cancellable.has(entity) || !id) return NextResponse.json({ success:false, error:"A valid record type and id are required" }, { status:400 });
    if (!reason) return NextResponse.json({ success:false, error:"Cancellation reason is required" }, { status:400 });

    const result = await prisma.$transaction(async tx => {
      if (entity === "ClinicalNote") {
        const note = await tx.clinicalNote.findFirst({ where:{ id, clinicId:membership.clinicId } });
        if (!note) return { status:404, body:{success:false,error:"Clinical note not found"} };
        if (note.status === "DRAFT") {
          await tx.clinicalNote.delete({ where:{id} });
          await tx.auditLog.create({data:{doctorId:session.doctorId,action:"DELETE_CANCELLED_DRAFT",entity,entityId:id,meta:JSON.stringify({clinicId:membership.clinicId,reason})}});
          return {status:200,body:{success:true,deleted:true,status:"DELETED"}};
        }
        if (note.status === "CANCELLED") return {status:409,body:{success:false,error:"Record is already cancelled"}};
        await tx.clinicalNote.update({where:{id},data:{status:"CANCELLED"}});
        await tx.auditLog.create({data:{doctorId:session.doctorId,action:"CANCEL",entity,entityId:id,meta:JSON.stringify({clinicId:membership.clinicId,reason,previousStatus:note.status,authorDoctorId:note.authorDoctorId,verifierDoctorId:note.verifierDoctorId})}});
        return {status:200,body:{success:true,status:"CANCELLED",reflected:true}};
      }

      if (entity === "Encounter") {
        const row=await tx.encounter.findFirst({where:{id,patient:{clinicId:membership.clinicId}}});
        if(!row)return {status:404,body:{success:false,error:"Encounter not found"}};
        if(row.status==="CANCELLED")return {status:409,body:{success:false,error:"Record is already cancelled"}};
        await tx.encounter.update({where:{id},data:{status:"CANCELLED",cancelledAt:new Date(),cancelledBy:session.doctorId,cancellationReason:reason}});
        await tx.auditLog.create({data:{doctorId:session.doctorId,action:"CANCEL",entity,entityId:id,meta:JSON.stringify({clinicId:membership.clinicId,reason,previousStatus:row.status})}});
        return {status:200,body:{success:true,status:"CANCELLED",reflected:true}};
      }

      if (entity === "Prescription") {
        const row=await tx.prescription.findFirst({where:{id,patient:{clinicId:membership.clinicId}}});
        if(!row)return {status:404,body:{success:false,error:"Medication order not found"}};
        if(row.status==="CANCELLED")return {status:409,body:{success:false,error:"Medication order is already cancelled"}};
        await tx.prescription.update({where:{id},data:{status:"CANCELLED",cancelledAt:new Date(),cancelledBy:session.doctorId,cancellationReason:reason}});
        await tx.auditLog.create({data:{doctorId:session.doctorId,action:"CANCEL",entity,entityId:id,meta:JSON.stringify({clinicId:membership.clinicId,reason,previousStatus:row.status})}});
        return {status:200,body:{success:true,status:"CANCELLED",reflected:true}};
      }

      if (entity === "LabOrder") {
        const row=await tx.labOrder.findFirst({where:{id,patient:{clinicId:membership.clinicId}}});
        if(!row)return {status:404,body:{success:false,error:"Lab order not found"}};
        if(row.status==="Cancelled")return {status:409,body:{success:false,error:"Lab order is already cancelled"}};
        await tx.labOrder.update({where:{id},data:{status:"Cancelled"}});
        await tx.auditLog.create({data:{doctorId:session.doctorId,action:"CANCEL",entity,entityId:id,meta:JSON.stringify({clinicId:membership.clinicId,reason,previousStatus:row.status})}});
        return {status:200,body:{success:true,status:"Cancelled",reflected:true}};
      }

      if (entity === "DiagnosticOrder") {
        const row=await tx.diagnosticOrder.findFirst({where:{id,patient:{clinicId:membership.clinicId}}});
        if(!row)return {status:404,body:{success:false,error:"Diagnostic order not found"}};
        if(row.status==="Cancelled")return {status:409,body:{success:false,error:"Diagnostic order is already cancelled"}};
        await tx.diagnosticOrder.update({where:{id},data:{status:"Cancelled"}});
        await tx.auditLog.create({data:{doctorId:session.doctorId,action:"CANCEL",entity,entityId:id,meta:JSON.stringify({clinicId:membership.clinicId,reason,previousStatus:row.status})}});
        return {status:200,body:{success:true,status:"Cancelled",reflected:true}};
      }

      if (entity === "MedicationAdministration") {
        const row=await tx.medicationAdministration.findFirst({where:{id,clinicId:membership.clinicId}});
        if(!row)return {status:404,body:{success:false,error:"Medication administration record not found"}};
        if(row.status==="CANCELLED")return {status:409,body:{success:false,error:"Medication administration is already cancelled"}};
        await tx.medicationAdministration.update({where:{id},data:{status:"CANCELLED"}});
        await tx.auditLog.create({data:{doctorId:session.doctorId,action:"CANCEL",entity,entityId:id,meta:JSON.stringify({clinicId:membership.clinicId,reason,previousStatus:row.status})}});
        return {status:200,body:{success:true,status:"CANCELLED",reflected:true}};
      }

      if (entity === "Appointment") {
        const row=await tx.appointment.findFirst({where:{id,patient:{clinicId:membership.clinicId}}});
        if(!row)return {status:404,body:{success:false,error:"Appointment not found"}};
        await tx.appointment.update({where:{id},data:{status:"Cancelled"}});
        await tx.auditLog.create({data:{doctorId:session.doctorId,action:"CANCEL",entity,entityId:id,meta:JSON.stringify({clinicId:membership.clinicId,reason,previousStatus:row.status})}});
        return {status:200,body:{success:true,status:"Cancelled",reflected:true}};
      }

      const specs:any = {
        EmergencyCase: ["emergencyCase","status","Cancelled"],
        BloodRequest: ["bloodRequest","status","Cancelled"],
        InsuranceClaim: ["insuranceClaim","status","Cancelled"],
        InsurancePolicy: ["insurancePolicy","status","Cancelled"]
      };
      if (specs[entity]) {
        const [model,field,value]=specs[entity];
        const row=await (tx as any)[model].findFirst({where:{id,clinicId:membership.clinicId}});
        if(!row)return {status:404,body:{success:false,error:"Record not found"}};
        await (tx as any)[model].update({where:{id},data:{[field]:value}});
        await tx.auditLog.create({data:{doctorId:session.doctorId,action:"CANCEL",entity,entityId:id,meta:JSON.stringify({clinicId:membership.clinicId,reason,previousStatus:row.status})}});
        return {status:200,body:{success:true,status:value,reflected:true}};
      }

      if (entity === "MedicalDocument") {
        const row=await tx.medicalDocument.findFirst({where:{id,clinicId:membership.clinicId}});
        if(!row)return {status:404,body:{success:false,error:"Document not found"}};
        await tx.medicalDocument.update({where:{id},data:{deletedAt:new Date()}});
        await tx.auditLog.create({data:{doctorId:session.doctorId,action:"CANCEL",entity,entityId:id,meta:JSON.stringify({clinicId:membership.clinicId,reason,previousStatus:row.deletedAt?"CANCELLED":"ACTIVE"})}});
        return {status:200,body:{success:true,status:"Cancelled",reflected:true}};
      }

      return {status:400,body:{success:false,error:"Unsupported record type"}};
    });
    return NextResponse.json(result.body,{status:result.status});
  } catch(e) {
    console.error("record cancellation",e);
    return NextResponse.json({success:false,error:"Server error"},{status:500});
  }
}
