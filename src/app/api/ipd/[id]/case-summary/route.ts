import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { requireClinicalModule } from "@/lib/clinic-products";
import { findAuthorizedPatient, requireActiveClinicMembership } from "@/lib/clinic-auth";
import { canAccessModule } from "@/lib/permissions";
import { cleanPatientNotes, parsePatientProfile } from "@/lib/patient-metadata";
import { writeAudit } from "@/lib/audit";
import { authBucketKey, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { generateLongitudinalCaseSummary, type LongitudinalCaseSummaryEvent, type LongitudinalCaseSummaryDay } from "@/lib/clinical-ai";

export const runtime = "nodejs";
const MAX_AUDIT_LOGS = 5000;
const MAX_TIMELINE_DAYS = 366;

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function clip(value: unknown, max = 700): string {
  if (value == null) return "";
  return String(value).replace(/\u0000/g, "").trim().slice(0, max);
}
function metaOf(value: { meta?: string | null } | null | undefined): Record<string, any> {
  try {
    const parsed = value?.meta ? JSON.parse(value.meta) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
function dateKey(value: Date | string | null | undefined): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const part = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return part("year") + "-" + part("month") + "-" + part("day");
}
function dateLabel(key: string): string {
  const parts = key.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return key;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12)).toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
  });
}
function timestampLabel(value: Date | string | null | undefined): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
  }) + " IST";
}
function extractDischargeDate(content: string): string {
  const match = content.match(/(?:date and time of discharge|discharge date(?:\/time)?)\s*:\s*([^\n\r]+)/i);
  return match ? clip(match[1], 120) : "";
}
function nonEmpty(parts: Array<string | null | undefined>): string {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(" | ");
}
function makeDailyRange(start: string, end: string): string[] {
  if (!start || !end) return start || end ? [start || end] : [];
  const a = new Date(start + "T12:00:00Z");
  const b = new Date(end + "T12:00:00Z");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return [start, end].filter(Boolean);
  const result: string[] = [];
  const cursor = new Date(a);
  while (cursor <= b && result.length < MAX_TIMELINE_DAYS) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return fail("Sign in to generate a case summary.", 401);

  const access = await requireClinicalModule(session.doctorId, "IPD");
  if (!access.allowed) return fail("IPD access is not included in this clinic's subscription.", 403);
  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership || membership.clinicId !== access.clinicId || !canAccessModule(membership.role, "ipd")) {
    return fail("IPD module access is not authorized for this role or clinic.", 403);
  }

  const { id: patientId } = await context.params;
  if (!patientId || patientId.length > 80) return fail("Invalid patient identifier.", 400);
  const limit = await consumeRateLimit(
    authBucketKey("ipd-case-summary", req, session.doctorId + ":" + patientId),
    8,
    15 * 60 * 1000,
  );
  if (!limit.allowed) {
    const limited = rateLimitResponse(limit.retryAfterSec);
    return NextResponse.json(limited.body, { status: 429, headers: { ...limited.headers, "Cache-Control": "no-store" } });
  }

  try {
    const patient = await findAuthorizedPatient(membership, patientId);
    if (!patient) return fail("Patient was not found in the selected clinic.", 404);

    const profile = parsePatientProfile(patient.notes || "") as Record<string, any>;
    const doctorIds = (await prisma.clinicMember.findMany({
      where: { clinicId: membership.clinicId, isActive: true },
      select: { doctorId: true },
    })).map((item) => item.doctorId);
    const [notes, encounters, prescriptions, labOrders, diagnosticOrders, administrations, dispensings, logs] = await Promise.all([
      prisma.clinicalNote.findMany({
        where: { patientId, clinicId: membership.clinicId },
        orderBy: { createdAt: "asc" },
        select: { id: true, noteType: true, title: true, content: true, status: true, authorRole: true, createdAt: true, updatedAt: true, finalizedAt: true },
      }),
      prisma.encounter.findMany({
        where: { patientId },
        orderBy: { createdAt: "asc" },
        select: { id: true, date: true, chiefComplaint: true, clinicalNotes: true, diagnosis: true, assessment: true, plan: true, bp: true, pulse: true, rr: true, spo2: true, temperature: true, weight: true, height: true, createdAt: true, updatedAt: true },
      }),
      prisma.prescription.findMany({
        where: { patientId },
        orderBy: { createdAt: "asc" },
        select: { id: true, medicines: true, advice: true, status: true, cancelledAt: true, cancellationReason: true, createdAt: true, updatedAt: true },
      }),
      prisma.labOrder.findMany({
        where: { patientId },
        orderBy: { orderedAt: "asc" },
        select: { id: true, testName: true, category: true, status: true, result: true, notes: true, orderedAt: true, resultedAt: true, createdAt: true, updatedAt: true },
      }),
      prisma.diagnosticOrder.findMany({
        where: { patientId },
        orderBy: { orderedAt: "asc" },
        select: { id: true, studyName: true, modality: true, indication: true, status: true, findings: true, impression: true, notes: true, orderedAt: true, performedAt: true, reportedAt: true, createdAt: true, updatedAt: true },
      }),
      prisma.medicationAdministration.findMany({
        where: { patientId, clinicId: membership.clinicId },
        orderBy: { scheduledAt: "asc" },
        select: { id: true, medicationText: true, medicationName: true, dose: true, doseUnit: true, route: true, frequency: true, scheduledAt: true, actualAt: true, status: true, reason: true, notes: true },
      }),
      prisma.dispensing.findMany({
        where: { patientId },
        orderBy: { createdAt: "asc" },
        select: { id: true, prescriptionId: true, medicines: true, status: true, dispensedAt: true, createdAt: true, updatedAt: true },
      }),
      prisma.auditLog.findMany({
        where: {
          OR: [
            { entityId: patientId },
            { doctorId: { in: doctorIds }, entity: { in: ["NursingVital", "IPDHandover", "ClinicalNote", "Patient", "RoomTransfer"] } },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: MAX_AUDIT_LOGS,
        select: { id: true, doctorId: true, action: true, entity: true, entityId: true, meta: true, createdAt: true },
      }),
    ]);

    const warnings: string[] = [];
    const admissionValue = String(profile.admissionDate || "").trim();
    const admissionKey = dateKey(admissionValue) || dateKey(patient.createdAt);
    if (!admissionValue) warnings.push("An explicit IPD admission date was not recorded in the patient profile; registration date was used as the timeline start.");
    if (admissionKey && dateKey(patient.createdAt) < admissionKey) {
      warnings.push("Admission date precedes the patient registration timestamp; verify that this is intentional.");
    }

    const events: Array<{ key: string; at: string; event: LongitudinalCaseSummaryEvent }> = [];
    function addEvent(at: Date | string | null | undefined, category: string, title: string, details: string, source: string) {
      const key = dateKey(at);
      if (!key) return;
      const time = timestampLabel(at);
      const fullTitle = (time ? time + " · " : "") + clip(title, 120);
      events.push({
        key,
        at: at instanceof Date ? at.toISOString() : String(at),
        event: { category: clip(category, 60), title: fullTitle, details: clip(details, 700), source: clip(source, 60) },
      });
    }

    const admissionContext = nonEmpty([
      profile.chiefComplaint ? "Presenting complaints: " + profile.chiefComplaint : "",
      profile.hpi ? "History of present illness: " + profile.hpi : "",
      profile.pastHistory ? "Past medical history: " + profile.pastHistory : "",
      profile.surgicalHistory ? "Surgical history: " + profile.surgicalHistory : "",
      profile.systemicExam ? "Admission examination: " + profile.systemicExam : "",
      profile.workingDiagnosis ? "Working diagnosis: " + profile.workingDiagnosis : "",
      profile.diagnosis ? "Documented diagnosis: " + profile.diagnosis : "",
      profile.consultantName ? "Consultant: " + profile.consultantName + (profile.consultantSpecialty ? " (" + profile.consultantSpecialty + ")" : "") : "",
      cleanPatientNotes(patient.notes || "") ? "Additional patient chart notes: " + clip(cleanPatientNotes(patient.notes || ""), 1500) : "",
    ]);
    addEvent(admissionValue || patient.createdAt, "Admission", "Admission profile", admissionContext || "IPD admission profile was present but did not contain a structured history.", "Patient profile");

    for (const n of notes) {
      // Do not feed a prior Case Summary back into its own source prompt.
      if (/^case summary$/i.test(n.noteType || "")) continue;
      addEvent(n.createdAt, /discharge/i.test(n.noteType + " " + n.title) ? "Discharge documentation" : "Clinical note", n.title || n.noteType, "Type: " + n.noteType + " | Status: " + n.status + (n.authorRole ? " | Author role: " + n.authorRole : "") + "\n" + n.content, "ClinicalNote");
    }

    for (const e of encounters) {
      const vitalText = nonEmpty([
        e.bp ? "BP " + e.bp : "",
        e.pulse ? "Pulse " + e.pulse : "",
        e.rr ? "RR " + e.rr : "",
        e.spo2 ? "SpO₂ " + e.spo2 : "",
        e.temperature ? "Temperature " + e.temperature : "",
        e.weight ? "Weight " + e.weight : "",
        e.height ? "Height " + e.height : "",
      ]);
      addEvent(e.date || e.createdAt, "Encounter / daily assessment", "Encounter " + (e.date || ""), nonEmpty([
        e.chiefComplaint ? "Complaint: " + e.chiefComplaint : "",
        e.clinicalNotes ? "Clinical notes: " + e.clinicalNotes : "",
        e.diagnosis ? "Diagnosis: " + e.diagnosis : "",
        e.assessment ? "Assessment: " + e.assessment : "",
        e.plan ? "Plan: " + e.plan : "",
        vitalText ? "Vitals: " + vitalText : "",
      ]), "Encounter");
    }
    for (const l of labOrders) {
      addEvent(l.resultedAt || l.updatedAt || l.orderedAt, "Laboratory", l.testName, "Status: " + l.status + (l.result ? " | Result: " + l.result : " | Result not recorded") + (l.category ? " | Category: " + l.category : "") + (l.notes ? " | Notes: " + l.notes : ""), "LabOrder");
    }
    for (const d of diagnosticOrders) {
      addEvent(d.reportedAt || d.performedAt || d.orderedAt, "Radiology / diagnostics", d.studyName, "Modality: " + d.modality + " | Status: " + d.status + (d.indication ? " | Indication: " + d.indication : "") + (d.findings ? " | Findings: " + d.findings : "") + (d.impression ? " | Impression: " + d.impression : "") + (d.notes ? " | Notes: " + d.notes : ""), "DiagnosticOrder");
    }
    for (const p of prescriptions) {
      addEvent(p.createdAt, "Prescription / medication order", "Medication order", "Status: " + p.status + (p.cancelledAt ? " | Cancelled: " + p.cancelledAt.toISOString() + (p.cancellationReason ? " (" + p.cancellationReason + ")" : "") : "") + (p.medicines ? " | Medicines: " + p.medicines : "") + (p.advice ? " | Advice: " + p.advice : ""), "Prescription");
    }
    for (const d of dispensings) {
      addEvent(d.dispensedAt || d.updatedAt || d.createdAt, "Pharmacy dispensing", "Dispensing", "Status: " + d.status + (d.medicines ? " | Medicines: " + d.medicines : "") + (d.prescriptionId ? " | Prescription ID: " + d.prescriptionId : ""), "Dispensing");
    }
    for (const a of administrations) {
      addEvent(a.actualAt || a.scheduledAt, "MAR / medication administration", a.medicationName || a.medicationText, "Recorded status: " + a.status + (a.dose ? " | Dose: " + a.dose + " " + a.doseUnit : "") + (a.route ? " | Route: " + a.route : "") + (a.frequency ? " | Frequency: " + a.frequency : "") + (a.actualAt ? " | Actual administration time recorded" : " | Actual administration time not recorded") + (a.reason ? " | Reason: " + a.reason : "") + (a.notes ? " | Notes: " + a.notes : ""), "MedicationAdministration");
    }

    const canonicalNoteIds = new Set(notes.map((n) => n.id));
    const handoverLogs: Array<{ createdAt: Date; meta: Record<string, any> }> = [];
    let dischargeDate = "";
    for (const log of logs) {
      const meta = metaOf(log);
      const logClinic = String(meta.clinicId || "");
      if (logClinic && logClinic !== String(membership.clinicId || "")) continue;
      const belongsToPatient = log.entityId === patientId || String(meta.patientId || "") === patientId;
      if (!belongsToPatient) continue;

      if (log.entity === "NursingVital") {
        addEvent(log.createdAt, "Nursing observations / precautions", "Nursing round", nonEmpty([
          meta.bp ? "BP " + meta.bp : "",
          meta.pulse ? "Pulse " + meta.pulse : "",
          meta.rr ? "RR " + meta.rr : "",
          meta.spo2 ? "SpO₂ " + meta.spo2 : "",
          meta.temperature ? "Temperature " + meta.temperature : "",
          meta.findings ? "Findings / precautions: " + meta.findings : "",
          meta.assessment ? "Assessment: " + meta.assessment : "",
          meta.notes ? "Notes: " + meta.notes : "",
        ]), "NursingVital audit record");
      } else if (log.entity === "IPDHandover") {
        const handoverDetails = nonEmpty([
          meta.receivingTeam ? "Receiving team: " + meta.receivingTeam : "",
          meta.receivingRole ? "Receiving role: " + meta.receivingRole : "",
          meta.context ? "Handover context: " + meta.context : "",
        ]);
        addEvent(log.createdAt, "Clinical handover", "IPD handover", handoverDetails || "Handover record", "IPDHandover audit record");
        handoverLogs.push({ createdAt: log.createdAt, meta });
      } else if (log.entity === "ClinicalNote" && typeof meta.content === "string" && meta.content.trim()) {
        if (meta.noteId && canonicalNoteIds.has(String(meta.noteId))) continue;
        const noteType = String(meta.noteType || "Clinical note");
        if (/^case summary$/i.test(noteType)) continue;
        addEvent(log.createdAt, /discharge/i.test(noteType + " " + String(meta.title || "")) ? "Discharge documentation" : "Clinical note (legacy)", String(meta.title || noteType), "Type: " + noteType + " | Status: " + String(meta.status || "legacy record") + "\n" + meta.content, "Legacy clinical note audit record");
      } else if (log.entity === "Patient") {
        if (/DISCHARGE_COMPLETE/i.test(log.action || "") || String(meta.status || "") === "DISCHARGED") {
          dischargeDate = dateKey(log.createdAt) || dischargeDate;
          addEvent(log.createdAt, "Discharge", "Discharge completed", nonEmpty([
            meta.status ? "Status: " + meta.status : "",
            meta.noteId ? "Final discharge note ID: " + meta.noteId : "",
          ]), "Discharge audit record");
        } else if (/room-transfer|transfer/i.test(log.action || "")) {
          addEvent(log.createdAt, "Ward / bed movement", "Room or ward transfer", nonEmpty([
            meta.fromRoom ? "From: " + meta.fromRoom : "",
            meta.roomNumber ? "To room: " + meta.roomNumber : "",
            meta.wardType ? "Ward: " + meta.wardType : "",
            meta.unitType ? "Unit: " + meta.unitType : "",
            meta.reason ? "Reason: " + meta.reason : "",
          ]), "Patient audit record");
        }
      }
    }

    for (const n of notes) {
      if (!/discharge/i.test(n.noteType + " " + n.title)) continue;
      const value = extractDischargeDate(n.content);
      if (value) {
        const extractedKey = dateKey(value);
        if (extractedKey) dischargeDate = extractedKey;
      }
    }
    if (!dischargeDate && patient.status === "DISCHARGED") {
      warnings.push("Patient is marked DISCHARGED but an explicit discharge completion timestamp was not found; review the final discharge documentation.");
    }
    const allKeys = events.map((event) => event.key).filter(Boolean).sort();
    const endKey = dischargeDate || allKeys[allKeys.length - 1] || admissionKey;
    let startKey = admissionKey || allKeys[0] || endKey;
    if (allKeys.length && startKey && allKeys[0] < startKey) {
      // Keep the requested admission-to-discharge span, but note that older chart entries were excluded.
      warnings.push("Some clinical records predate the recorded admission date and are excluded from the in-stay day-by-day timeline.");
    }
    if (patient.status === "DISCHARGED" && dischargeDate) {
      // The confirmed discharge day anchors the end of the timeline.
    } else if (allKeys.length && endKey < allKeys[allKeys.length - 1]) {
      warnings.push("Records dated after the identified discharge date were found; verify chronology before finalizing.");
    }
    const keys = makeDailyRange(startKey, endKey);
    if (keys.length >= MAX_TIMELINE_DAYS && keys[keys.length - 1] < endKey) {
      warnings.push("The admission span exceeds the one-year timeline limit; review older source chart entries before finalizing.");
    }

    const grouped = new Map<string, Array<{ at: string; event: LongitudinalCaseSummaryEvent }>>();
    for (const item of events) {
      if (startKey && item.key < startKey) continue;
      if (endKey && item.key > endKey) continue;
      const list = grouped.get(item.key) || [];
      list.push({ at: item.at, event: item.event });
      grouped.set(item.key, list);
    }
    const dailyTimeline: LongitudinalCaseSummaryDay[] = keys.map((key) => ({
      date: dateLabel(key),
      events: [...(grouped.get(key) || [])]
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
        .map((item) => item.event),
    }));
    const meaningfulEventCount = events.filter((item) => item.key >= startKey && item.key <= endKey).length;
    if (meaningfulEventCount === 0) return fail("No dated clinical history was found for this admission. Add or verify source chart notes before generating a case summary.", 422);

    const sourceCounts = {
      "Clinical notes (excluding previous case summaries)": notes.filter((n) => !/^case summary$/i.test(n.noteType || "")).length,
      "Encounters / assessments": encounters.length,
      "Lab orders/results": labOrders.length,
      "Radiology / diagnostic records": diagnosticOrders.length,
      "Prescriptions": prescriptions.length,
      "Pharmacy dispensing records": dispensings.length,
      "Medication administration (MAR)": administrations.length,
      "Nursing observations": logs.filter((log) => log.entity === "NursingVital" && (log.entityId === patientId || String(metaOf(log).patientId || "") === patientId)).length,
      "Clinical handovers": handoverLogs.length,
    };
    const generated = await generateLongitudinalCaseSummary({
      patient: {
        name: patient.name,
        age: typeof patient.age === "number" ? patient.age : null,
        gender: patient.gender || "",
        uhid: patient.uhid || "",
        allergies: patient.allergies || "Unknown / not assessed",
        status: patient.status,
        admissionDate: admissionKey ? dateLabel(admissionKey) : "Not recorded",
        dischargeDate: dischargeDate ? dateLabel(dischargeDate) : patient.status === "DISCHARGED" ? "Not recorded" : "Still admitted / no discharge record",
      },
      admissionContext,
      days: dailyTimeline,
      sourceCounts,
      dataWarnings: warnings,
    });

    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: "IPD_LONGITUDINAL_CASE_SUMMARY_REQUESTED",
      entity: "ClinicalAiDraft",
      entityId: patientId,
      meta: {
        patientId,
        admissionDate: admissionKey || null,
        dischargeDate: dischargeDate || null,
        dayCount: generated.dayCount,
        eventCount: generated.eventCount,
        source: generated.source,
        sourceCounts: generated.sourceCounts,
        // Never put case-summary content or patient narrative into audit metadata.
      },
    });
    return NextResponse.json({
      success: true,
      draft: {
        content: generated.content,
        source: generated.source,
        disclaimer: generated.disclaimer,
        dayCount: generated.dayCount,
        eventCount: generated.eventCount,
        sourceCounts: generated.sourceCounts,
        dataWarnings: generated.dataWarnings,
      },
      admissionDate: admissionKey ? dateLabel(admissionKey) : "",
      dischargeDate: dischargeDate ? dateLabel(dischargeDate) : "",
      finalized: false,
      noteId: null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("IPD longitudinal case summary failed", error instanceof Error ? error.message : "unknown");
    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: "IPD_LONGITUDINAL_CASE_SUMMARY_FAILED",
      entity: "ClinicalAiDraft",
      entityId: patientId,
      meta: { patientId, reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" },
    });
    return fail("The longitudinal case summary could not be generated. Review the source chart and try again.", 502);
  }
}
