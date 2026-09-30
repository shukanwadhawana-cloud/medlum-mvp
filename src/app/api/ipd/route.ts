import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { cleanPatientNotes, encodePatientNotes, parseCareSetting, parsePatientProfile } from "@/lib/patient-metadata";
import { requireClinicalModule } from "@/lib/clinic-products";
import { normalizeClinicRole } from "@/lib/clinic-auth";

function metaOf(l: { meta?: string | null } | null | undefined) {
  try { return l?.meta ? JSON.parse(l.meta) : {}; } catch { return {}; }
}
async function getPatient(patientId: string, doctorId: string, clinicId: string | null) {
  if (clinicId) {
    return prisma.patient.findFirst({ where: { id: patientId, clinicId, deletedAt: null } });
  }
  return prisma.patient.findFirst({ where: { id: patientId, doctorId, deletedAt: null } });
}
function istIsoLabel(d: Date) {
  try {
    return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  } catch {
    return d.toISOString();
  }
}

function mapIpdPatient(
  p: { id: string; name: string; age: number; gender: string; phone: string; allergies: string; status: string; notes: string },
  vitalsMap: Map<string, unknown>,
  notesMap: Map<string, unknown[]>,
  labOrders: { patientId: string }[],
  diagnosticOrders: { patientId: string }[],
  prescriptions: { patientId: string }[],
  encounters: { patientId: string }[]
) {
  const profile = parsePatientProfile(p.notes);
  const latest = vitalsMap.get(p.id) || null;
  return {
    id: p.id, name: p.name, age: p.age, gender: p.gender, phone: p.phone, allergies: p.allergies, status: p.status,
    notes: cleanPatientNotes(p.notes), ...profile, vitals: latest,
    clinicalNotes: notesMap.get(p.id) || [],
    labOrders: labOrders.filter((l) => l.patientId === p.id),
    diagnosticOrders: diagnosticOrders.filter((d) => d.patientId === p.id),
    prescriptions: prescriptions.filter((r) => r.patientId === p.id),
    encounters: encounters.filter((e) => e.patientId === p.id),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireClinicalModule(session.doctorId,"IPD");
  if (!access.allowed) return NextResponse.json({ error: "IPD access is not included in this clinic's subscription." }, { status: 403 });
  const clinicId = access.clinicId;
  const doctorIds = clinicId
    ? (await prisma.clinicMember.findMany({ where: { clinicId, isActive: true }, select: { doctorId: true } })).map((x) => x.doctorId)
    : [session.doctorId];
  const patients = await prisma.patient.findMany({
    where: { deletedAt: null, ...(clinicId ? { clinicId, doctorId: { in: doctorIds } } : { doctorId: { in: doctorIds } }) },
    orderBy: { createdAt: "desc" },
  });
  const patientIds = patients.map((p) => p.id);
  const [logs, encounters, prescriptions, labOrders, diagnosticOrders, clinicalNotes] = await Promise.all([
    prisma.auditLog.findMany({ where: { doctorId: { in: doctorIds }, entity: { in: ["HospitalRoom", "ClinicalNote", "NursingVital"] } }, orderBy: { createdAt: "desc" }, take: 3000 }),
    prisma.encounter.findMany({ where: { patientId: { in: patientIds } }, orderBy: { createdAt: "desc" } }),
    prisma.prescription.findMany({ where: { patientId: { in: patientIds } }, orderBy: { createdAt: "desc" } }),
    prisma.labOrder.findMany({ where: { patientId: { in: patientIds } }, orderBy: { createdAt: "desc" } }),
    prisma.diagnosticOrder.findMany({ where: { patientId: { in: patientIds } }, orderBy: { createdAt: "desc" } }),
    prisma.clinicalNote.findMany({ where: { patientId: { in: patientIds }, clinicId: clinicId || undefined }, include: { author: { select: { id: true, name: true } }, verifier: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const notesMap = new Map<string, unknown[]>();
  for (const n of clinicalNotes) { const arr = notesMap.get(n.patientId) || []; arr.push(n); notesMap.set(n.patientId, arr); }
  const vitalsMap = new Map<string, unknown>();
  for (const l of logs) {
    if (l.entity !== "NursingVital") continue;
    const m = metaOf(l);
    if (!l.entityId || vitalsMap.has(l.entityId)) continue;
    vitalsMap.set(l.entityId, m);
  }
  const result = patients.filter((p) => parseCareSetting(p.notes) === "IPD" && p.status === "ACTIVE").map((p) => mapIpdPatient(p, vitalsMap, notesMap, labOrders, diagnosticOrders, prescriptions, encounters));
  const ipdHistory = patients.filter((p) => parseCareSetting(p.notes) === "IPD" && p.status !== "ACTIVE").map((p) => mapIpdPatient(p, vitalsMap, notesMap, labOrders, diagnosticOrders, prescriptions, encounters));
  return NextResponse.json({ patients: result, ipdHistory });
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const access = await requireClinicalModule(session.doctorId,"IPD");
    if (!access.allowed) return NextResponse.json({ success: false, error: "IPD access is not included in this clinic's subscription." }, { status: 403 });
    const clinicId = access.clinicId;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const membership = await prisma.clinicMember.findFirst({ where: { doctorId: session.doctorId, clinicId: clinicId || undefined, isActive: true }, select: { role: true } });
    const actorRole = membership?.role || "Consultant";

    if (action === "lab-order") {
      const patientId = String(body.patientId || "");
      const testsFromArray = Array.isArray(body.tests) ? body.tests.map((x: unknown) => String(x || "").trim()).filter(Boolean) : [];
      const single = String(body.testName || "").trim();
      const testNames = testsFromArray.length ? testsFromArray : single ? [single] : [];
      if (!patientId || !testNames.length) return NextResponse.json({ success: false, error: "Patient and investigation are required" }, { status: 400 });
      const patient = await getPatient(patientId, session.doctorId, clinicId);
      if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
      const category = String(body.category || "Laboratory");
      const notes = String(body.notes || "");
      const orders = [];
      for (const testName of testNames) {
        const order = await prisma.labOrder.create({ data: { doctorId: session.doctorId, patientId, patientName: patient.name, testName, category, notes } });
        orders.push(order);
        await writeAudit({ doctorId: session.doctorId, action: "create", entity: "LabOrder", entityId: order.id, meta: { patientId, testName, category, ipd: true, clinicId } });
      }
      await writeAudit({ doctorId: session.doctorId, action: "create", entity: "ClinicalNote", entityId: patientId, meta: { noteType: "Investigation Indent", content: testNames.join(", "), orderIds: orders.map((o) => o.id), status: "Pending", clinicId } });
      return NextResponse.json({ success: true, orders, order: orders[0] });
    }

    if (action === "update-allergies") {
      const patientId = String(body.patientId || "");
      const allergies = String(body.allergies ?? body.allergy ?? "").trim();
      if (!patientId) return NextResponse.json({ success: false, error: "Patient required" }, { status: 400 });
      const patient = await getPatient(patientId, session.doctorId, clinicId);
      if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
      await prisma.patient.update({ where: { id: patientId }, data: { allergies } });
      await writeAudit({ doctorId: session.doctorId, action: "update", entity: "Patient", entityId: patientId, meta: { allergiesUpdated: true, clinicId } });
      return NextResponse.json({ success: true, allergies });
    }

    if (action === "register") {
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      if (!name || !phone) return NextResponse.json({ success: false, error: "Name and phone required" }, { status: 400 });
      const careSetting = "IPD" as const;
      const profile = {
        address: String(body.address || ""), idType: String(body.idType || ""), idNumber: String(body.idNumber || ""),
        mlcNumber: String(body.mlcNumber || ""), prdNumber: String(body.prdNumber || ""), wardType: String(body.wardType || ""),
        unitType: String(body.unitType || ""), roomNumber: String(body.roomNumber || ""),
        admissionDate: body.admissionDate ? String(body.admissionDate) : new Date().toISOString(),
        chiefComplaint: String(body.chiefComplaint || ""), hpi: String(body.hpi || ""), pastHistory: String(body.pastHistory || ""),
        surgicalHistory: String(body.surgicalHistory || ""), systemicExam: String(body.systemicExam || ""),
        workingDiagnosis: String(body.workingDiagnosis || ""), diagnosis: String(body.diagnosis || ""), icdCode: String(body.icdCode || ""),
        consultantName: String(body.consultantName || ""), consultantSpecialty: String(body.consultantSpecialty || ""),
      };
      const patient = await prisma.patient.create({
        data: {
          doctorId: session.doctorId, clinicId, name, age: parseInt(String(body.age), 10) || 0,
          gender: String(body.gender || "Male"), phone, bp: "", allergies: String(body.allergies || ""),
          notes: encodePatientNotes(String(body.notes || ""), careSetting, profile),
        },
      });
      await writeAudit({ doctorId: session.doctorId, action: "create", entity: "Patient", entityId: patient.id, meta: { careSetting, ipdRegistration: true, clinicId } });
      return NextResponse.json({ success: true, patient: { id: patient.id } });
    }

    if (action === "clinical-note") {
      const patientId = String(body.patientId || "");
      const content = String(body.content || "");
      const noteType = String(body.noteType || "Progress Note");
      if (!patientId || !content.trim()) return NextResponse.json({ success: false, error: "Patient and note content required" }, { status: 400 });
      const patient = await getPatient(patientId, session.doctorId, clinicId);
      if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
      const allergyUpdate = String(body.allergy || body.allergies || "").trim();
      if (allergyUpdate) await prisma.patient.update({ where: { id: patientId }, data: { allergies: allergyUpdate } });
      await writeAudit({
        doctorId: session.doctorId, action: "create", entity: "ClinicalNote", entityId: patientId,
        meta: { noteType, title: String(body.title || noteType), content, authorRole: String(body.authorRole || actorRole), status: body.submit ? "Pending Verification" : "Open", clinicId },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "vitals") {
      if (normalizeClinicRole(actorRole) !== "Nurse") return NextResponse.json({ success: false, error: "Only an active Nurse can create or update nursing rounds." }, { status: 403 });
      const patientId = String(body.patientId || "");
      if (!patientId) return NextResponse.json({ success: false, error: "Patient required" }, { status: 400 });
      const patient = await getPatient(patientId, session.doctorId, clinicId);
      if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
      await writeAudit({
        doctorId: session.doctorId, action: "create", entity: "NursingVital", entityId: patientId,
        meta: { bp: String(body.bp || ""), pulse: String(body.pulse || ""), rr: String(body.rr || ""), spo2: String(body.spo2 || ""), temperature: String(body.temperature || ""), findings: String(body.findings || body.assessment || "").trim(), authorRole: "Nurse", clinicId },
      });
      return NextResponse.json({ success: true });
    }

    if(action==="room"){const roomNumber=String(body.roomNumber||"").trim();if(!roomNumber)return NextResponse.json({success:false,error:"Room number required"},{status:400});const existingRooms=await prisma.auditLog.findMany({where:{doctorId:{in:(await prisma.clinicMember.findMany({where:{clinicId,isActive:true},select:{doctorId:true}})).map(x=>x.doctorId)},entity:"HospitalRoom"},orderBy:{createdAt:"desc"},take:3000});if(existingRooms.some(l=>{const m=metaOf(l);return String(m.clinicId||"")===String(clinicId||"")&&String(m.roomNumber||"").trim()===roomNumber;}))return NextResponse.json({success:false,error:"Room already exists in this clinic."},{status:409});await writeAudit({doctorId:session.doctorId,action:"create",entity:"HospitalRoom",entityId:crypto.randomUUID(),meta:{roomNumber,roomCategory:String(body.roomCategory||"General Ward"),unitType:String(body.unitType||"Ward"),clinicId}});return NextResponse.json({success:true});}

    if(action==="room-transfer"){
      const patientId=String(body.patientId||"");
      const roomNumber=String(body.roomNumber||"").trim();
      if(!patientId||!roomNumber)return NextResponse.json({success:false,error:"Patient and destination room are required"},{status:400});
      const result=await prisma.$transaction(async tx=>{
        const patient=await tx.patient.findFirst({where:clinicId?{id:patientId,clinicId}:{id:patientId,doctorId:session.doctorId}});
        if(!patient)return {status:404,body:{success:false,error:"Patient not found in this clinic."}};
        if(patient.status!=="ACTIVE"||parseCareSetting(patient.notes)!=="IPD")return {status:409,body:{success:false,error:"Only an active IPD patient can be assigned or transferred."}};
        const profile=parsePatientProfile(patient.notes);
        const currentRoom=String(profile.roomNumber||"").trim();
        if(currentRoom===roomNumber)return {status:409,body:{success:false,error:"Patient is already assigned to this room."}};
        const members=await tx.clinicMember.findMany({where:{clinicId:clinicId||undefined,isActive:true},select:{doctorId:true}});
        const roomLogs=await tx.auditLog.findMany({where:{doctorId:{in:members.map(x=>x.doctorId)},entity:"HospitalRoom"},orderBy:{createdAt:"desc"},take:3000});
        const roomExists=roomLogs.some(l=>{const m=metaOf(l);return String(m.clinicId||"")===String(clinicId||"")&&String(m.roomNumber||"").trim()===roomNumber;});
        if(!roomExists)return {status:404,body:{success:false,error:"Destination room is not in the hospital directory."}};
        const occupied=await tx.patient.findMany({where:{clinicId:clinicId||undefined,status:"ACTIVE",deletedAt:null},select:{id:true,notes:true}});
        const occupiedByOther=occupied.some(p=>p.id!==patientId&&parseCareSetting(p.notes)==="IPD"&&String(parsePatientProfile(p.notes).roomNumber||"").trim()===roomNumber);
        if(occupiedByOther)return {status:409,body:{success:false,error:"Destination room is already occupied by another active IPD patient."}};
        const nextProfile={...profile,roomNumber};
        await tx.patient.update({where:{id:patientId},data:{notes:encodePatientNotes(cleanPatientNotes(patient.notes),parseCareSetting(patient.notes),nextProfile)}});
        const audit=await tx.auditLog.create({data:{doctorId:session.doctorId,action:"transfer",entity:"HospitalRoom",entityId:patientId,meta:JSON.stringify({clinicId,patientId,fromRoom:currentRoom||null,toRoom:roomNumber,actorRole})}});
        return {status:200,body:{success:true,patientId,fromRoom:currentRoom||null,toRoom:roomNumber,auditId:audit.id}};
      },{isolationLevel:"Serializable"});
      return NextResponse.json(result.body,{status:result.status});
    }

    if(action==="handover"){
      const patientId=String(body.patientId||"").trim();
      const receivingMemberId=String(body.receivingMemberId||"").trim();
      const context=String(body.context||"").trim();
      if(!patientId||!receivingMemberId||!context)return NextResponse.json({success:false,error:"Patient, receiving clinician/team and handover context are required."},{status:400});
      const eligibleRoles=new Set(["Owner","Admin","Manager","Consultant","Doctor","RMO","Nurse"]);
      try{
        const result=await prisma.$transaction(async tx=>{
          const patient=await tx.patient.findFirst({where:clinicId?{id:patientId,clinicId}:{id:patientId,doctorId:session.doctorId}});
          if(!patient)return {status:404,body:{success:false,error:"Patient not found in this clinic."}};
          if(patient.status!=="ACTIVE"||parseCareSetting(patient.notes)!=="IPD")return {status:409,body:{success:false,error:"Only an active IPD patient can be handed over."}};
          const receiving=await tx.clinicMember.findFirst({where:{id:receivingMemberId,clinicId,isActive:true,doctor:{isActive:true}},select:{id:true,doctorId:true,role:true,staffCode:true,designation:true,department:true,doctor:{select:{name:true}}}});
          if(!receiving)return {status:404,body:{success:false,error:"Receiving clinician/team is not an active member of this clinic."}};
          const receivingRole=normalizeClinicRole(receiving.role);
          if(!eligibleRoles.has(receivingRole))return {status:403,body:{success:false,error:"Selected receiving identity is not eligible for IPD clinical handover."}};
          if(receiving.doctorId===session.doctorId)return {status:409,body:{success:false,error:"Receiving clinician must be different from the acting clinician."}};
          await tx.patient.update({where:{id:patientId},data:{updatedAt:new Date()}});
          const clinicDoctorIds=(await tx.clinicMember.findMany({where:{clinicId,isActive:true},select:{doctorId:true}})).map(m=>m.doctorId);
          const latest=await tx.auditLog.findFirst({where:{entity:"IPDHandover",entityId:patientId,doctorId:{in:clinicDoctorIds}},orderBy:{createdAt:"desc"}});
          const latestMeta=metaOf(latest||{});
          if(String(latestMeta.receivingDoctorId||"")===receiving.doctorId)return {status:409,body:{success:false,error:"This patient is already handed over to the selected receiving clinician/team."}};
          const now=new Date();
          const audit=await tx.auditLog.create({data:{doctorId:session.doctorId,action:"HANDOVER",entity:"IPDHandover",entityId:patientId,meta:JSON.stringify({clinicId,patientId,receivingMemberId:receiving.id,receivingDoctorId:receiving.doctorId,receivingTeam:receiving.doctor.name,receivingRole,context,atIst:istIsoLabel(now)})}});
          return {status:200,body:{success:true,patientId,receivingDoctorId:receiving.doctorId,receivingTeam:receiving.doctor.name,context,auditId:audit.id}};
        },{isolationLevel:"Serializable"});
        return NextResponse.json(result.body,{status:result.status});
      }catch(e:unknown){
        if(e&&typeof e==="object"&&"code" in e&&(e as{code?:string}).code==="P2034")return NextResponse.json({success:false,error:"Handover conflicted with another concurrent update. Please retry."},{status:409});
        throw e;
      }
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("ipd api", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
