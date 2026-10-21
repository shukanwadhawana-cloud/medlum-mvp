import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { cleanPatientNotes, encodePatientNotes, parseCareSetting, parsePatientProfile } from "@/lib/patient-metadata";
import { requireClinicalModule } from "@/lib/clinic-products";
import { canViewFullClinicalChart, normalizeClinicRole, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { canAccessModule } from "@/lib/permissions";
import { canFinalizeClinicalNote, hashClinicalNote } from "@/lib/clinical-signing";

function metaOf(l: { meta?: string | null } | null | undefined) {
  try { return l?.meta ? JSON.parse(l.meta) : {}; } catch { return {}; }
}
async function getPatient(patientId: string, doctorId: string, clinicId: string | null) {
  if (clinicId) {
    return prisma.patient.findFirst({ where: { id: patientId, clinicId } });
  }
  return prisma.patient.findFirst({ where: { id: patientId, doctorId } });
}
function normalizeRoomCategory(value: unknown, unitType: unknown = "Ward") {
  const unit = String(unitType || "Ward").trim();
  if (unit === "ICU") return "ICU";
  const raw = String(value || "General").trim().toLowerCase();
  if (raw === "general ward" || raw === "general") return "General";
  if (raw === "deluxe ward" || raw === "deluxe") return "Deluxe";
  if (raw === "super deluxe ward" || raw === "super deluxe") return "Super Deluxe";
  if (raw === "twin sharing") return "Twin Sharing";
  if (raw === "vip") return "VIP";
  return String(value || "General").trim();
}

function istIsoLabel(d: Date) {
  try {
    return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  } catch {
    return d.toISOString();
  }
}

function mapIpdPatient(
  p: { id: string; name: string; age: number; gender: string; phone: string; allergies: string; status: string; notes: string; uhid?: string; registrationNo?: string },
  vitalsMap: Map<string, unknown>,
  notesMap: Map<string, unknown[]>,
  labOrders: { patientId: string }[],
  diagnosticOrders: { patientId: string }[],
  prescriptions: { patientId: string; id: string }[],
  encounters: { patientId: string }[]
) {
  const profile = parsePatientProfile(p.notes);
  const latest = vitalsMap.get(p.id) || null;
  return {
    id: p.id, name: p.name, age: p.age, gender: p.gender, phone: p.phone, allergies: p.allergies, status: p.status,
    uhid: p.uhid || "", registrationNo: p.registrationNo || "",
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
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership || membership.clinicId !== clinicId || !canAccessModule(membership.role, "ipd")) {
    return NextResponse.json({ success: false, error: "IPD module access is not authorized for this role or clinic.", code: "RBAC_DENIED" }, { status: 403 });
  }
  const doctorIds = clinicId
    ? (await prisma.clinicMember.findMany({ where: { clinicId, isActive: true }, select: { doctorId: true } })).map((x) => x.doctorId)
    : [session.doctorId];
  // Once a clinical module has resolved the active facility, facility membership
  // is the patient boundary. Do not additionally require the admitting doctor to
  // still be an active member: that would make valid IPD admissions disappear
  // when a doctor leaves the facility or when an Owner is viewing the census.
  const patients = await prisma.patient.findMany({
    where: { deletedAt: null, ...(clinicId ? { clinicId } : { doctorId: { in: doctorIds } }) },
    orderBy: { createdAt: "desc" },
  });
  const patientIds = patients.map((p) => p.id);
  const [logs, encounters, prescriptions, dispensings, labOrders, diagnosticOrders, clinicalNotes] = await Promise.all([
    prisma.auditLog.findMany({ where: { OR: [{ doctorId: { in: doctorIds }, entity: { in: ["HospitalRoom", "ClinicalNote", "NursingVital"] } }, { entity: "ClinicalNote", entityId: { in: patientIds } }] }, orderBy: { createdAt: "desc" }, take: 5000 }),
    prisma.encounter.findMany({ where: { patientId: { in: patientIds } }, orderBy: { createdAt: "desc" } }),
    prisma.prescription.findMany({ where: { patientId: { in: patientIds } }, orderBy: { createdAt: "desc" } }),
    prisma.dispensing.findMany({ where: { patientId: { in: patientIds } }, orderBy: { createdAt: "desc" } }),
    prisma.labOrder.findMany({ where: { patientId: { in: patientIds } }, orderBy: { createdAt: "desc" } }),
    prisma.diagnosticOrder.findMany({ where: { patientId: { in: patientIds } }, orderBy: { createdAt: "desc" } }),
    prisma.clinicalNote.findMany({ where: { patientId: { in: patientIds }, clinicId: clinicId || undefined }, include: { author: { select: { id: true, name: true } }, verifier: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const dispensingByPrescriptionId = new Map(dispensings.map((d) => [d.prescriptionId, d]));
  const notesMap = new Map<string, unknown[]>();
  for (const n of clinicalNotes) {
    const arr = notesMap.get(n.patientId) || [];
    arr.push({
      ...n,
      authorName:n.author?.name||"Clinician",
      verifierName:n.verifier?.name||null,
    });
    notesMap.set(n.patientId, arr);
  }

  // Backward compatibility: the older IPD save handler wrote clinical-note content
  // only to AuditLog metadata. Surface those already-saved entries while new saves
  // are persisted in ClinicalNote. New audit events point at note.id and are skipped
  // here because their noteId is already present in the persisted records.
  const patientIdSet = new Set(patientIds);
  for (const log of logs) {
    if (log.entity !== "ClinicalNote" || !log.entityId) continue;
    const meta = metaOf(log);
    const patientId = String(meta.patientId || log.entityId || "");
    if (!patientIdSet.has(patientId)) continue;
    if (meta.clinicId && clinicId && meta.clinicId !== clinicId) continue;
    if (typeof meta.content !== "string" || !meta.content.trim()) continue;
    if (typeof meta.noteType !== "string" || !meta.noteType.trim()) continue;
    if (typeof meta.title !== "string" || !meta.title.trim()) continue;
    if (typeof meta.authorRole !== "string" || !meta.authorRole.trim()) continue;

    const arr = notesMap.get(patientId) || [];
    if (meta.noteId && arr.some((row: any) => row.id === meta.noteId)) continue;
    const loggedAt = new Date(log.createdAt).getTime();
    const duplicate = arr.some((row: any) => {
      // Only deduplicate against canonical database rows, never against a prior
      // legacy audit-only note: two identical notes may legitimately be recorded.
      if (row.legacyAuditRecord) return false;
      if (row.noteType !== meta.noteType || row.title !== meta.title || row.content !== meta.content) return false;
      const savedAt = new Date(row.createdAt || 0).getTime();
      return Number.isFinite(loggedAt) && Number.isFinite(savedAt) && Math.abs(savedAt - loggedAt) < 120000;
    });
    if (duplicate) continue;

    arr.push({
      id: `legacy-audit-${log.id}`,
      patientId,
      noteType: meta.noteType,
      title: meta.title,
      content: meta.content,
      authorRole: meta.authorRole,
      authorDoctorId: log.doctorId,
      authorName: String(meta.authorRole).split(/\s+·\s+/)[0].trim() || String(meta.authorRole),
      status: typeof meta.status === "string" ? meta.status.trim().toUpperCase().replace(/[\s-]+/g, "_") : "DRAFT",
      version: 1,
      createdAt: log.createdAt,
      updatedAt: log.createdAt,
      legacyAuditRecord: true,
    });
    notesMap.set(patientId, arr);
  }
  for (const notes of notesMap.values()) {
    notes.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  const vitalsMap = new Map<string, unknown>();
  for (const l of logs) {
    if (l.entity !== "NursingVital") continue;
    const m = metaOf(l);
    if (!l.entityId || vitalsMap.has(l.entityId)) continue;
    vitalsMap.set(l.entityId, m);
  }
  const result = patients.filter((p) => parseCareSetting(p.notes) === "IPD" && p.status === "ACTIVE").map((p) => {
    const mapped = mapIpdPatient(p, vitalsMap, notesMap, labOrders, diagnosticOrders, prescriptions, encounters);
    return {
      ...mapped,
      prescriptions: mapped.prescriptions.map((r: { id: string }) => ({
        ...r,
        prescriptionId:r.id,
        pharmacyStatus:dispensingByPrescriptionId.get(r.id)?.status||"Not sent to pharmacy",
        dispensingId: dispensingByPrescriptionId.get(r.id)?.id || null,
      })),
    };
  });
  const ipdHistory = patients.filter((p) => parseCareSetting(p.notes) === "IPD" && p.status !== "ACTIVE").map((p) => {
    const mapped = mapIpdPatient(p, vitalsMap, notesMap, labOrders, diagnosticOrders, prescriptions, encounters);
    return {
      ...mapped,
      prescriptions: mapped.prescriptions.map((r: { id: string }) => ({
        ...r,
        prescriptionId:r.id,
        pharmacyStatus:dispensingByPrescriptionId.get(r.id)?.status||"Not sent to pharmacy",
        dispensingId: dispensingByPrescriptionId.get(r.id)?.id || null,
      })),
    };
  });
  const roomDirectory = new Map<string, { id: string; roomNumber: string; roomCategory: string; unitType: string }>();
  for (const log of logs) {
    if (log.entity !== "HospitalRoom") continue;
    const meta = metaOf(log);
    if (String(meta.clinicId || "") !== String(clinicId || "")) continue;
    const roomNumber = String(meta.roomNumber || "").trim();
    if (!roomNumber || roomDirectory.has(roomNumber)) continue;
    roomDirectory.set(roomNumber, {
      id: String(log.entityId || roomNumber),
      roomNumber,
      roomCategory: normalizeRoomCategory(meta.roomCategory, meta.unitType),
      unitType: String(meta.unitType || "Ward"),
    });
  }
  const rooms = Array.from(roomDirectory.values()).map((room) => {
    const occupant = result.find((patient: any) => String(patient.roomNumber || "").trim() === room.roomNumber);
    return { ...room, occupied: Boolean(occupant), occupiedByPatientId: occupant?.id || null };
  }).sort((a, b) => a.unitType.localeCompare(b.unitType) || a.roomCategory.localeCompare(b.roomCategory) || a.roomNumber.localeCompare(b.roomNumber));
  return NextResponse.json({ patients: result, ipdHistory, rooms }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const access = await requireClinicalModule(session.doctorId,"IPD");
    if (!access.allowed) return NextResponse.json({ success: false, error: "IPD access is not included in this clinic's subscription." }, { status: 403 });
    const clinicId = access.clinicId;
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership || membership.clinicId !== clinicId || !canAccessModule(membership.role, "ipd")) {
    return NextResponse.json({ success: false, error: "IPD module access is not authorized for this role or clinic.", code: "RBAC_DENIED" }, { status: 403 });
  }
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const actorRole = membership.role;

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

    if (action === "update-admission-details" || action === "update-diagnosis") {
      const patientId = String(body.patientId || "").trim();
      if (!patientId) return NextResponse.json({ success: false, error: "Patient is required." }, { status: 400 });
      const patient = await getPatient(patientId, session.doctorId, clinicId);
      if (!patient) return NextResponse.json({ success: false, error: "Patient not found in this clinic." }, { status: 404 });
      const profile = parsePatientProfile(patient.notes);
      const nextProfile = action === "update-diagnosis"
        ? { ...profile,
            workingDiagnosis: String(body.workingDiagnosis ?? profile.workingDiagnosis ?? "").trim(),
            diagnosis: String(body.diagnosis ?? profile.diagnosis ?? "").trim(),
            icdCode: String(body.icdCode ?? profile.icdCode ?? "").trim(),
          }
        : { ...profile,
            consultantName: String(body.consultantName ?? profile.consultantName ?? "").trim(),
            consultantSpecialty: String(body.consultantSpecialty ?? profile.consultantSpecialty ?? "").trim(),
          };
      const existingUhid = String(patient.uhid || patient.registrationNo || "").trim();
      const uhid = existingUhid || `MLH-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}`;
      await prisma.patient.update({ where: { id: patientId }, data: {
        ...(patient.uhid ? {} : { uhid }),
        ...(patient.registrationNo ? {} : { registrationNo: uhid }),
        notes: encodePatientNotes(cleanPatientNotes(patient.notes), parseCareSetting(patient.notes), nextProfile),
      } });
      await writeAudit({ doctorId: session.doctorId, action: "update", entity: "Patient", entityId: patientId, meta: {
        clinicId, updateType: action, consultantName: nextProfile.consultantName || "",
        consultantSpecialty: nextProfile.consultantSpecialty || "", diagnosisUpdated: action === "update-diagnosis",
        uhidAssigned: !existingUhid && Boolean(uhid),
      } });
      return NextResponse.json({ success: true, patientId, uhid, profile: nextProfile });
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
          uhid: `MLH-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}`,
          registrationNo: "",
          notes: encodePatientNotes(String(body.notes || ""), careSetting, profile),
        },
      });
      await writeAudit({ doctorId: session.doctorId, action: "create", entity: "Patient", entityId: patient.id, meta: { careSetting, ipdRegistration: true, clinicId } });
      return NextResponse.json({ success: true, patient: { id: patient.id } });
    }

    if (action === "discharge-summary-draft" || action === "discharge-summary-submit" || action === "discharge-complete") {
      if (!canViewFullClinicalChart(membership.role)) {
        return NextResponse.json({ success: false, error: "Clinical chart permissions are required for discharge summaries.", code: "RBAC_DENIED" }, { status: 403 });
      }
      if (!clinicId) return NextResponse.json({ success: false, error: "An active clinic membership is required for discharge summary signing." }, { status: 403 });
      const patientId = String(body.patientId || "").trim();
      const content = String(body.content || "").trim();
      if (!patientId) return NextResponse.json({ success: false, error: "Patient ID is required." }, { status: 400 });
      const patient = await getPatient(patientId, session.doctorId, clinicId);
      if (!patient) return NextResponse.json({ success: false, error: "Patient not found in this clinic." }, { status: 404 });
      if (parseCareSetting(patient.notes) !== "IPD") return NextResponse.json({ success: false, error: "Patient is not an IPD admission." }, { status: 409 });
      const now = new Date();

      if (action === "discharge-summary-draft") {
        if (!content) return NextResponse.json({ success: false, error: "Discharge summary content required." }, { status: 400 });
        const existing = await prisma.clinicalNote.findFirst({
          where: { clinicId, patientId, authorDoctorId: session.doctorId, noteType: "Discharge Note", status: "DRAFT" },
          orderBy: { updatedAt: "desc" },
        });
        const version = (existing?.version || 0) + 1;
        const contentHash = hashClinicalNote(content, version);
        let note;
        try {
          note = await prisma.$transaction(async (tx) => {
            let saved;
            if (existing) {
              const changed = await tx.clinicalNote.updateMany({
                where: { id: existing.id, clinicId, patientId, authorDoctorId: session.doctorId, status: "DRAFT", version: existing.version },
                data: { content, title: "Discharge Summary", contentHash, version, updatedAt: now },
              });
              if (changed.count !== 1) throw new Error("DISCHARGE_DRAFT_CHANGED");
              saved = await tx.clinicalNote.findUniqueOrThrow({ where: { id: existing.id } });
            } else {
              saved = await tx.clinicalNote.create({ data: {
                clinicId, patientId, authorDoctorId: session.doctorId, authorRole: actorRole,
                noteType: "Discharge Note", title: "Discharge Summary", content,
                status: "DRAFT", version, contentHash,
              } });
            }
            await tx.clinicalNoteVersion.create({ data: {
              clinicalNoteId: saved.id, clinicId, version, title: "Discharge Summary",
              noteType: "Discharge Note", content, contentHash,
              event: existing ? "DRAFT_SAVED" : "CREATED_DRAFT",
              createdByDoctorId: session.doctorId, createdAt: now,
            } });
            return saved;
          }, { isolationLevel: "Serializable" });
        } catch (error: any) {
          if (error?.code === "P2034" || error?.message === "DISCHARGE_DRAFT_CHANGED") {
            return NextResponse.json({ success: false, error: "The discharge summary changed while saving. Reload and try again." }, { status: 409 });
          }
          throw error;
        }
        await writeAudit({ doctorId: session.doctorId, clinicId, action: "DISCHARGE_SUMMARY_DRAFT", entity: "ClinicalNote", entityId: note.id, meta: { clinicId, patientId, noteId: note.id, status: note.status, version: note.version, contentHash } });
        return NextResponse.json({ success: true, noteId: note.id, status: note.status, authorDoctorId: session.doctorId });
      }

      if (action === "discharge-summary-submit") {
        const note = await prisma.clinicalNote.findFirst({
          where: { clinicId, patientId, authorDoctorId: session.doctorId, noteType: "Discharge Note", status: "DRAFT" },
          orderBy: { updatedAt: "desc" },
        });
        if (!note) return NextResponse.json({ success: false, error: "Save your own discharge summary draft before submitting it for independent verification." }, { status: 409 });
        const nextContent = content || note.content;
        if (!nextContent.trim()) return NextResponse.json({ success: false, error: "Discharge summary content required." }, { status: 400 });
        if (!/Acknowledgement of receipt:\s*Yes/i.test(nextContent)) return NextResponse.json({ success: false, error: "The patient acknowledgement must be recorded before submitting the discharge summary." }, { status: 400 });
        const version = note.version + 1;
        const contentHash = hashClinicalNote(nextContent, version);
        const submitted = await prisma.$transaction(async (tx) => {
          const changed = await tx.clinicalNote.updateMany({
            where: { id: note.id, clinicId, patientId, authorDoctorId: session.doctorId, status: "DRAFT", version: note.version },
            data: { content: nextContent, version, contentHash, status: "PENDING_VERIFICATION", submittedAt: now },
          });
          if (changed.count !== 1) return changed;
          await tx.clinicalNoteVersion.create({ data: {
            clinicalNoteId: note.id, clinicId, version, title: note.title || "Discharge Summary",
            noteType: "Discharge Note", content: nextContent, contentHash,
            event: "SUBMITTED_FOR_VERIFICATION", createdByDoctorId: session.doctorId, createdAt: now,
          } });
          await tx.auditLog.create({ data: {
            doctorId: session.doctorId, action: "DISCHARGE_SUMMARY_SUBMIT", entity: "ClinicalNote", entityId: note.id,
            meta: JSON.stringify({ clinicId, patientId, noteId: note.id, status: "PENDING_VERIFICATION", version, contentHash, at: now.toISOString() }),
          } });
          return changed;
        }, { isolationLevel: "Serializable" });
        if (submitted.count !== 1) return NextResponse.json({ success: false, error: "The discharge summary changed while you were submitting it. Reload and try again." }, { status: 409 });
        return NextResponse.json({ success: true, noteId: note.id, status: "PENDING_VERIFICATION", authorDoctorId: session.doctorId });
      }

      if (!canFinalizeClinicalNote(normalizeClinicRole(membership.role))) {
        return NextResponse.json({ success: false, error: "Your clinic role cannot sign and complete a discharge summary.", code: "RBAC_DENIED" }, { status: 403 });
      }

      // Prefer the requesting clinician's own submitted summary. The canonical UI
      // sends noteId so the signature is applied to the exact reviewed note.
      const requestedNoteId = String(body.noteId || "").trim();
      const pendingWhere = { clinicId, patientId, noteType: "Discharge Note", status: "PENDING_VERIFICATION" };
      const note = requestedNoteId
        ? await prisma.clinicalNote.findFirst({ where: { ...pendingWhere, id: requestedNoteId } })
        : (await prisma.clinicalNote.findFirst({
            where: { ...pendingWhere, authorDoctorId: session.doctorId },
            orderBy: { updatedAt: "desc" },
          })) || await prisma.clinicalNote.findFirst({
            where: pendingWhere,
            orderBy: { updatedAt: "desc" },
          });

      if (!note) return NextResponse.json({ success: false, error: "Save and submit a discharge summary before signing and completing discharge." }, { status: 409 });
      const isAuthorSigner = note.authorDoctorId === session.doctorId;
      if (!/Acknowledgement of receipt:\s*Yes/i.test(note.content)) {
        return NextResponse.json({ success: false, error: "The patient acknowledgement must be recorded before discharge." }, { status: 409 });
      }
      if (note.contentHash !== hashClinicalNote(note.content, note.version)) {
        return NextResponse.json({ success: false, error: "Discharge summary integrity check failed. Do not sign this version; ask the author to review it." }, { status: 409 });
      }
      if (patient.status === "DISCHARGED") return NextResponse.json({ success: false, error: "Patient is already discharged." }, { status: 409 });

      // Signing is a new, immutable note-version event; never reuse the version
      // number occupied by the submitted draft (the DB enforces uniqueness).
      const signedVersion = note.version + 1;
      const signedContentHash = hashClinicalNote(note.content, signedVersion);
      const finalHash = isAuthorSigner
        ? hashClinicalNote(`${note.content}\\nAUTHOR:${note.authorDoctorId}\\nAUTHOR_SIGNATURE:${session.doctorId}\\nNOTE:${note.id}`, signedVersion)
        : hashClinicalNote(`${note.content}\\nAUTHOR:${note.authorDoctorId}\\nVERIFIER:${session.doctorId}\\nNOTE:${note.id}`, signedVersion);
      try {
        await prisma.$transaction(async (tx) => {
          const currentPatient = await tx.patient.findFirst({
            where: { id: patient.id, clinicId, deletedAt: null },
            select: { status: true },
          });
          if (!currentPatient || currentPatient.status !== "ACTIVE") {
            const error = new Error("Patient is already discharged or no longer active in IPD.");
            (error as Error & { code?: string }).code = "ALREADY_DISCHARGED";
            throw error;
          }
          const signed = await tx.clinicalNote.updateMany({
            where: {
              id: note.id, clinicId, patientId, status: "PENDING_VERIFICATION",
              verifierDoctorId: null, version: note.version, contentHash: note.contentHash,
              authorDoctorId: isAuthorSigner ? session.doctorId : { not: session.doctorId },
            },
            data: {
              status: "FINAL",
              version: signedVersion,
              contentHash: signedContentHash,
              verifierDoctorId: isAuthorSigner ? null : session.doctorId,
              verifiedAt: isAuthorSigner ? null : now,
              finalizedAt: now,
              finalHash,
            },
          });
          if (signed.count !== 1) {
            const error = new Error("The discharge summary changed or was signed concurrently. Reload and try again.");
            (error as Error & { code?: string }).code = "NOTE_CHANGED";
            throw error;
          }
          await tx.clinicalNoteVersion.create({ data: {
            clinicalNoteId: note.id,
            clinicId,
            version: signedVersion,
            title: note.title || "Discharge Summary",
            noteType: "Discharge Note",
            content: note.content,
            contentHash: signedContentHash,
            event: isAuthorSigner ? "AUTHOR_SIGNED" : "FINAL_SIGNED",
            createdByDoctorId: session.doctorId,
            createdAt: now,
          } });
          await tx.auditLog.create({ data: {
            doctorId: session.doctorId,
            action: isAuthorSigner ? "AUTHOR_SIGN" : "FINAL_SIGN",
            entity: "ClinicalNote",
            entityId: note.id,
            meta: JSON.stringify({
              clinicId, patientId, noteId: note.id,
              authorDoctorId: note.authorDoctorId,
              signedByDoctorId: session.doctorId,
              signingMode: isAuthorSigner ? "AUTHOR_SIGNATURE" : "INDEPENDENT_VERIFICATION",
              submittedVersion: note.version, signedVersion,
              contentHash: signedContentHash, finalHash, at: now.toISOString(),
            }),
          } });
          const discharged = await tx.patient.updateMany({
            where: { id: patient.id, clinicId, deletedAt: null, status: "ACTIVE" },
            data: { status: "DISCHARGED" },
          });
          if (discharged.count !== 1) {
            const error = new Error("Patient is already discharged or no longer active in IPD.");
            (error as Error & { code?: string }).code = "ALREADY_DISCHARGED";
            throw error;
          }
        }, { isolationLevel: "Serializable" });
      } catch (error: unknown) {
        const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "";
        if (code === "ALREADY_DISCHARGED") return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Patient is already discharged." }, { status: 409 });
        if (code === "NOTE_CHANGED" || code === "P2034") return NextResponse.json({ success: false, error: "Discharge summary changed concurrently. Reload and try again." }, { status: 409 });
        throw error;
      }
      await writeAudit({
        doctorId: session.doctorId,
        clinicId,
        action: "DISCHARGE_COMPLETE",
        entity: "Patient",
        entityId: patient.id,
        meta: {
          clinicId, noteId: note.id, authorDoctorId: note.authorDoctorId,
          finalizedByDoctorId: session.doctorId,
          verifierDoctorId: isAuthorSigner ? null : session.doctorId,
          signingMode: isAuthorSigner ? "AUTHOR_SIGNATURE" : "INDEPENDENT_VERIFICATION",
          signedVersion, status: "DISCHARGED",
        },
      });
      return NextResponse.json({
        success: true,
        noteId: note.id,
        version: signedVersion,
        status: "FINAL",
        patientStatus: "DISCHARGED",
        authorDoctorId: note.authorDoctorId,
        authorSignedByDoctorId: isAuthorSigner ? session.doctorId : null,
        verifierDoctorId: isAuthorSigner ? null : session.doctorId,
      });
    }

    if (action === "clinical-note") {
      const patientId = String(body.patientId || "").trim();
      const content = String(body.content || "").trim();
      const noteType = String(body.noteType || "Progress Note").trim();
      const title = String(body.title || noteType).trim();
      const submit = body.submit === true;
      const sign = body.sign === true;
      if (submit && sign) return NextResponse.json({ success: false, error: "Choose author signing or co-signature submission, not both." }, { status: 400 });
      if (!patientId || !content) return NextResponse.json({ success: false, error: "Patient and note content required" }, { status: 400 });
      if (!noteType || !title) return NextResponse.json({ success: false, error: "Note type and title are required" }, { status: 400 });

      const patient = await getPatient(patientId, session.doctorId, clinicId);
      if (!patient) return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });

      const allergyUpdate = String(body.allergy || body.allergies || "").trim();
      const now = new Date();
      const version = 1;
      const status = sign ? "FINAL" : submit ? "PENDING_VERIFICATION" : "DRAFT";
      const contentHash = hashClinicalNote(content, version);
      const noteRecord = await prisma.$transaction(async (tx) => {
        const created = await tx.clinicalNote.create({
          data: {
            clinicId,
            patientId,
            authorDoctorId: session.doctorId,
            authorRole: String(actorRole || "Consultant"),
            noteType,
            title,
            content,
            status,
            version,
            contentHash,
            finalizedAt: sign ? now : null,
            submittedAt: submit ? now : null,
          },
          include: {
            author: { select: { id: true, name: true, email: true } },
            verifier: { select: { id: true, name: true, email: true } },
          },
        });
        let finalHash = "";
        if (sign) {
          finalHash = hashClinicalNote(`${content}\\nAUTHOR:${session.doctorId}\\nAUTHOR_SIGNATURE:${session.doctorId}\\nNOTE:${created.id}`, version);
          await tx.clinicalNote.update({ where: { id: created.id }, data: { finalHash } });
        }
        await tx.clinicalNoteVersion.create({
          data: {
            clinicalNoteId: created.id,
            clinicId,
            version,
            title,
            noteType,
            content,
            contentHash,
            event: sign ? "CREATED_AND_AUTHOR_SIGNED" : submit ? "CREATED_AND_SUBMITTED" : "CREATED_DRAFT",
            createdByDoctorId: session.doctorId,
            createdAt: now,
          },
        });
        if (allergyUpdate) {
          await tx.patient.update({ where: { id: patientId }, data: { allergies: allergyUpdate } });
        }
        return { ...created, finalHash };
      });

      await writeAudit({
        doctorId: session.doctorId,
        clinicId,
        action: sign ? "AUTHOR_SIGN" : submit ? "SUBMIT_FOR_VERIFICATION" : "CREATE_DRAFT",
        entity: "ClinicalNote",
        entityId: noteRecord.id,
        meta: {
          noteId: noteRecord.id,
          patientId,
          noteType,
          title,
          content,
          authorRole: String(body.authorRole || actorRole),
          status,
          version,
          contentHash,
          finalHash: noteRecord.finalHash,
          signedByDoctorId: sign ? session.doctorId : null,
          clinicId,
          atIst: istIsoLabel(now),
        },
      });
      return NextResponse.json({ success: true, note: { ...noteRecord, authorName: noteRecord.author?.name || "Clinician" } });
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

    if (action === "admit") {
      const patientId = String(body.patientId || "").trim();
      const unitType = String(body.unitType || body.wardType || "Ward").trim();
      const roomCategory = normalizeRoomCategory(body.roomCategory || body.wardType || "General", unitType);
      const roomNumber = String(body.roomNumber || "").trim();
      if (!patientId) return NextResponse.json({ success: false, error: "Patient is required for admission." }, { status: 400 });
      if (!["Ward", "ICU"].includes(unitType)) return NextResponse.json({ success: false, error: "Choose Ward or ICU as the destination." }, { status: 400 });
      const allowedCategories = unitType === "ICU" ? ["ICU"] : ["General", "Twin Sharing", "Deluxe", "Super Deluxe", "VIP"];
      if (!allowedCategories.includes(roomCategory)) return NextResponse.json({ success: false, error: "Accommodation category does not match the selected destination." }, { status: 400 });

      const outcome = await prisma.$transaction(async (tx) => {
        const patient = await tx.patient.findFirst({ where: clinicId ? { id: patientId, clinicId, deletedAt: null } : { id: patientId, doctorId: session.doctorId, deletedAt: null } });
        if (!patient) return { status: 404, body: { success: false, error: "Patient was not found in this clinic." } };
        if (patient.status !== "ACTIVE" || parseCareSetting(patient.notes) === "IPD") return { status: 409, body: { success: false, error: "Only an active OPD patient can be admitted. Refresh the patient record and try again." } };
        const profile = parsePatientProfile(patient.notes);
        if (roomNumber) {
          const members = await tx.clinicMember.findMany({ where: { clinicId: clinicId || undefined, isActive: true }, select: { doctorId: true } });
          const roomLogs = await tx.auditLog.findMany({ where: { doctorId: { in: members.map((x) => x.doctorId) }, entity: "HospitalRoom" }, orderBy: { createdAt: "desc" }, take: 3000 });
          const directoryRoom = roomLogs.map((log) => ({ log, meta: metaOf(log) })).find(({ meta }) =>
            String(meta.clinicId || "") === String(clinicId || "") &&
            String(meta.roomNumber || "").trim() === roomNumber &&
            String(meta.unitType || "Ward") === unitType &&
            normalizeRoomCategory(meta.roomCategory, meta.unitType) === roomCategory
          );
          if (!directoryRoom) return { status: 404, body: { success: false, error: "Selected bed does not match an available room in this clinic's hospital directory." } };
          const activePatients = await tx.patient.findMany({ where: { ...(clinicId ? { clinicId } : { doctorId: session.doctorId }), status: "ACTIVE", deletedAt: null }, select: { id: true, notes: true } });
          const occupied = activePatients.some((p) => p.id !== patientId && parseCareSetting(p.notes) === "IPD" && String(parsePatientProfile(p.notes).roomNumber || "").trim() === roomNumber);
          if (occupied) return { status: 409, body: { success: false, error: "This bed has already been assigned to another active IPD patient. Refresh the bed list." } };
        }
        const nextProfile = {
          ...profile,
          careSetting: "IPD",
          wardType: roomCategory,
          unitType,
          roomNumber,
          admissionDate: body.admissionDate ? String(body.admissionDate) : new Date().toISOString(),
          consultantName: String(body.consultantName || profile.consultantName || ""),
          admissionReason: String(body.admissionReason || "").slice(0, 1000),
        };
        await tx.patient.update({ where: { id: patientId }, data: { notes: encodePatientNotes(cleanPatientNotes(patient.notes), "IPD", nextProfile) } });
        return { status: 200, body: { success: true, patientId, careSetting: "IPD", wardType: roomCategory, unitType, roomNumber: roomNumber || null } };
      }, { isolationLevel: "Serializable" });
      if (outcome.body.success) {
        await writeAudit({ doctorId: session.doctorId, action: "admit", entity: "Patient", entityId: patientId, meta: { clinicId, unitType, roomCategory, roomNumber: roomNumber || null, admissionReason: String(body.admissionReason || "").slice(0, 1000) } });
      }
      return NextResponse.json(outcome.body, { status: outcome.status });
    }

    if(action==="room"){const roomNumber=String(body.roomNumber||"").trim();if(!roomNumber)return NextResponse.json({success:false,error:"Room number required"},{status:400});const existingRooms=await prisma.auditLog.findMany({where:{doctorId:{in:(await prisma.clinicMember.findMany({where:{clinicId,isActive:true},select:{doctorId:true}})).map(x=>x.doctorId)},entity:"HospitalRoom"},orderBy:{createdAt:"desc"},take:3000});if(existingRooms.some(l=>{const m=metaOf(l);return String(m.clinicId||"")===String(clinicId||"")&&String(m.roomNumber||"").trim()===roomNumber;}))return NextResponse.json({success:false,error:"Room already exists in this clinic."},{status:409});await writeAudit({doctorId:session.doctorId,action:"create",entity:"HospitalRoom",entityId:crypto.randomUUID(),meta:{roomNumber,roomCategory:normalizeRoomCategory(body.roomCategory,body.unitType),unitType:String(body.unitType||"Ward"),clinicId}});return NextResponse.json({success:true});}

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
