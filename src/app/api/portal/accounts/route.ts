import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function POST(req:Request){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  const membership=await prisma.clinicMember.findFirst({where:{doctorId:session.doctorId},select:{clinicId:true,role:true}});
  if(!membership)return NextResponse.json({error:"Clinic membership required"},{status:403});
  if(!["Owner","Admin","Consultant"].includes(membership.role))return NextResponse.json({error:"Not permitted"},{status:403});
  try{
    const body=await req.json(); const patientId=String(body.patientId||""); const password=String(body.password||"");
    if(!patientId||password.length<8)return NextResponse.json({success:false,error:"Patient and a password of at least 8 characters are required."},{status:400});
    const patient=await prisma.patient.findFirst({where:{id:patientId,clinicId:membership.clinicId},select:{id:true,phone:true}});
    if(!patient)return NextResponse.json({success:false,error:"Patient not found in this clinic."},{status:404});
    if(!patient.phone.trim())return NextResponse.json({success:false,error:"Patient must have a phone number before portal access can be created."},{status:400});
    const hash=await bcrypt.hash(password,12);
    const existing=await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "PatientPortalAccount" WHERE "patientId"=${patient.id} LIMIT 1`;
    if(existing[0]){
      await prisma.$executeRaw`UPDATE "PatientPortalAccount" SET phone=${patient.phone.trim()}, "passwordHash"=${hash}, status='Active', "updatedAt"=NOW() WHERE id=${existing[0].id}`;
      return NextResponse.json({success:true,created:false});
    }
    await prisma.$executeRaw`INSERT INTO "PatientPortalAccount" (id,"clinicId","patientId",phone,"passwordHash",status,"createdAt","updatedAt") VALUES (gen_random_uuid()::text,${membership.clinicId},${patient.id},${patient.phone.trim()},${hash},'Active',NOW(),NOW())`;
    return NextResponse.json({success:true,created:true});
  }catch(e){console.error("portal account",e);return NextResponse.json({success:false,error:"Unable to provision portal access."},{status:500});}
}
