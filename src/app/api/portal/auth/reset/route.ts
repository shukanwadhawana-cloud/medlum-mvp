import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function POST(req:Request){
 const session=await getSession(); if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const membership=await prisma.clinicMember.findFirst({where:{doctorId:session.doctorId},select:{clinicId:true,role:true}});
 if(!membership||!["Owner","Admin","Consultant"].includes(membership.role))return NextResponse.json({error:"Not permitted"},{status:403});
 const body=await req.json().catch(()=>({})); const patientId=String(body.patientId||""); const password=String(body.password||"");
 if(!patientId||password.length<8)return NextResponse.json({error:"Patient and a password of at least 8 characters are required."},{status:400});
 const patient=await prisma.patient.findFirst({where:{id:patientId,clinicId:membership.clinicId},select:{id:true,phone:true}}); if(!patient)return NextResponse.json({error:"Patient not found."},{status:404});
 const hash=await bcrypt.hash(password,12);
 const rows=await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM "PatientPortalAccount" WHERE "patientId"=${patient.id} LIMIT 1`;
 if(!rows[0])return NextResponse.json({error:"Portal access has not been enabled for this patient."},{status:404});
 await prisma.$executeRaw`UPDATE "PatientPortalAccount" SET "passwordHash"=${hash}, status='Active', "updatedAt"=NOW() WHERE id=${rows[0].id}`;
 return NextResponse.json({success:true});
}
