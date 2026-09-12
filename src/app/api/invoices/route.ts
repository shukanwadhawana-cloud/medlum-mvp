import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

async function clinicForDoctor(doctorId: string) {
  const member = await prisma.clinicMember.findFirst({ where: { doctorId }, select: { clinicId: true, role: true } });
  return member;
}

async function sharedPatient(patientId: string, clinicId: string) {
  return prisma.patient.findFirst({ where: { id: patientId, clinicId } });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const member = await clinicForDoctor(session.doctorId);
  if (!member) return NextResponse.json({ invoices: [] });
  const list = await prisma.invoice.findMany({
    where: { clinicId: member.clinicId },
    include: { items: { orderBy: { createdAt: "asc" } }, payments: { orderBy: { paidAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ invoices: list.map((i) => {
    const total = Number(i.total ?? i.amount);
    const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
    return { id:i.id, doctorId:i.doctorId, patientId:i.patientId, patientName:i.patientName, amount:i.amount, subtotal:i.subtotal, discount:i.discount, tax:i.tax, total, status:i.status, note:i.note, dueDate:i.dueDate?.toISOString() || null, createdAt:i.createdAt.toISOString(), items:i.items, payments:i.payments.map(p=>({id:p.id,amount:p.amount,method:p.method,paidAt:p.paidAt.toISOString(),reference:p.reference,note:p.note,doctorId:p.doctorId})), paid, balance:Math.max(0,total-paid) };
  }) });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const patientId = String(body.patientId || "");
    const member = await clinicForDoctor(session.doctorId);
    if (!member || !(await sharedPatient(patientId, member.clinicId))) return NextResponse.json({ success:false,error:"Patient not found" },{status:404});
    const patient = await sharedPatient(patientId, member.clinicId);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems.map((x:any)=>({ description:String(x.description||"").trim(), category:String(x.category||"Service"), quantity:Number(x.quantity||1), unitPrice:Number(x.unitPrice||0) })).filter((x:any)=>x.description && x.quantity>0 && x.unitPrice>=0);
    if (!items.length) return NextResponse.json({success:false,error:"At least one invoice item is required"},{status:400});
    const subtotal = items.reduce((s:any,x:any)=>s+x.quantity*x.unitPrice,0);
    const discount = Math.max(0,Number(body.discount||0));
    const tax = Math.max(0,Number(body.tax||0));
    const total = Math.max(0,subtotal-discount+tax);
    if (total <= 0) return NextResponse.json({success:false,error:"Invoice total must be greater than zero"},{status:400});
    const inv = await prisma.invoice.create({ data:{ doctorId:session.doctorId, patientId, patientName:patient!.name, clinicId:member.clinicId, amount:total, subtotal, discount, tax, total, status:"Pending", note:String(body.note||""), dueDate:body.dueDate?new Date(body.dueDate):null, items:{create:items.map((x:any)=>({...x,amount:x.quantity*x.unitPrice}))} }, include:{items:true,payments:true} });
    await writeAudit({doctorId:session.doctorId,action:"create",entity:"Invoice",entityId:inv.id,meta:{total,subtotal,discount,tax,itemCount:items.length}});
    return NextResponse.json({success:true,invoice:inv});
  } catch(e){ console.error("create invoice",e); return NextResponse.json({success:false,error:"Server error"},{status:500}); }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error:"Unauthorized" },{status:401});
  try {
    const body=await req.json(); const id=String(body.id||""); const action=String(body.action||"");
    const member=await clinicForDoctor(session.doctorId); if(!member) return NextResponse.json({success:false,error:"Clinic not found"},{status:403});
    const existing=await prisma.invoice.findFirst({where:{id,clinicId:member.clinicId},include:{payments:true}});
    if(!existing) return NextResponse.json({success:false,error:"Invoice not found"},{status:404});
    const total=Number(existing.total??existing.amount);
    if(action==="payment"){
      const amount=Number(body.amount||0); if(amount<=0) return NextResponse.json({success:false,error:"Enter a valid payment"},{status:400});
      const alreadyPaid=existing.payments.reduce((s,p)=>s+Number(p.amount),0); const balance=total-alreadyPaid;
      if(amount>balance+0.0001) return NextResponse.json({success:false,error:`Payment exceeds outstanding balance of ₹${balance.toFixed(2)}`},{status:400});
      const payment=await prisma.payment.create({data:{invoiceId:id,doctorId:session.doctorId,patientId:existing.patientId,amount,method:String(body.method||"Cash"),paidAt:body.paidAt?new Date(body.paidAt):new Date(),reference:String(body.reference||"")||null,note:String(body.note||"")||null}});
      const newPaid=alreadyPaid+amount; const status=newPaid>=total-0.0001?"Paid":"Partially Paid";
      const updated=await prisma.invoice.update({where:{id},data:{status},include:{items:true,payments:true}});
      await writeAudit({doctorId:session.doctorId,action:"payment",entity:"Invoice",entityId:id,meta:{paymentId:payment.id,amount,method:payment.method,status}});
      return NextResponse.json({success:true,invoice:updated,payment});
    }
    if(action==="status"){
      const status=String(body.status||""); if(!["Pending","Partially Paid","Paid","Cancelled"].includes(status)) return NextResponse.json({success:false,error:"Invalid status"},{status:400});
      const updated=await prisma.invoice.update({where:{id},data:{status},include:{items:true,payments:true}});
      await writeAudit({doctorId:session.doctorId,action:"update_status",entity:"Invoice",entityId:id,meta:{status}});
      return NextResponse.json({success:true,invoice:updated});
    }
    return NextResponse.json({success:false,error:"Unknown action"},{status:400});
  } catch(e){ console.error("patch invoice",e); return NextResponse.json({success:false,error:"Server error"},{status:500}); }
}
