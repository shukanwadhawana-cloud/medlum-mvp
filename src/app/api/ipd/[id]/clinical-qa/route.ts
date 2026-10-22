import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  canViewFullClinicalChart,
  findAuthorizedPatient,
  requireActiveClinicMembership,
} from "@/lib/clinic-auth";
import { requireClinicalModule } from "@/lib/clinic-products";
import { parseCareSetting, parsePatientProfile } from "@/lib/patient-metadata";
import { writeAudit } from "@/lib/audit";
import { authBucketKey, consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUESTION_IDS = new Set([
  "antibiotic-day", "last-antibiotic-dose", "missed-doses", "current-medications",
  "creatinine-trend", "latest-labs", "latest-vitals", "pending-investigations",
  "last-24-hours", "allergies-diagnosis",
  "mar-last-24h",
  "pending-doses",
  "antibiotic-review",
  "medication-reconciliation",
  "vte-prophylaxis",
  "cbc-results",
  "hemoglobin-trend",
  "wbc-trend",
  "electrolyte-trend",
  "glucose-results",
  "abnormal-labs",
  "latest-imaging",
  "microbiology-results",
  "infection-workup",
  "latest-assessment-plan",
  "latest-note",
  "nursing-observations",
  "latest-handover",
  "patient-round-summary",
  "cognition-delirium",
  "goals-escalation",
  "discharge-plan",
  "devices-lines",
  "urine-output",
  "nutrition-plan",
  "mobility-safety",
  "pain-assessment",
]);
const ADDITIONAL_QUESTION_IDS = new Set([
  "mar-last-24h",
  "pending-doses",
  "antibiotic-review",
  "medication-reconciliation",
  "vte-prophylaxis",
  "cbc-results",
  "hemoglobin-trend",
  "wbc-trend",
  "electrolyte-trend",
  "glucose-results",
  "abnormal-labs",
  "latest-imaging",
  "microbiology-results",
  "infection-workup",
  "latest-assessment-plan",
  "latest-note",
  "nursing-observations",
  "latest-handover",
  "patient-round-summary",
  "cognition-delirium",
  "goals-escalation",
  "discharge-plan",
  "devices-lines",
  "urine-output",
  "nutrition-plan",
  "mobility-safety",
  "pain-assessment",
]);
const IST = "Asia/Kolkata";
const DISCLAIMER =
  "Read-only, chart-derived answer. Verify source entries and timestamps before clinical decisions. Missing documentation is not evidence that an event did not occur. This tool does not diagnose, prescribe, or change the record.";

type Source = { label: string; at: string; title: string };
type Answer = { answer: string; sources: Source[]; disclaimer: string; generatedAt: string };
type PatientContext = { notes: string; allergies: string; status: string };

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}
function safeText(value: unknown, max = 500): string {
  return value == null ? "" : String(value).replace(/\u0000/g, "").trim().slice(0, max);
}
function istParts(value: Date | string | null | undefined) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (name: string) => parts.find((p) => p.type === name)?.value || "";
  return { date: get("year") + "-" + get("month") + "-" + get("day"), value: d };
}
function dateLabel(value: Date | string | null | undefined): string {
  const parts = istParts(value);
  return parts ? new Intl.DateTimeFormat("en-IN", {
    timeZone: IST, day: "2-digit", month: "short", year: "numeric",
  }).format(parts.value) : "Date not recorded";
}
function dateTimeLabel(value: Date | string | null | undefined): string {
  const parts = istParts(value);
  return parts ? new Intl.DateTimeFormat("en-IN", {
    timeZone: IST, day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(parts.value) + " IST" : "Time not recorded";
}
function dayDifferenceInclusive(first: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const a = Date.parse(first + "T12:00:00Z");
  const b = Date.parse(today + "T12:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.floor((b - a) / 86400000) + 1;
}
function isAntibiotic(value: unknown): boolean {
  return /\b(?:cef(?:azolin|alexin|adroxil|uroxime|ixime|triaxone|otaxime|epime|operazone|podoxime|dinir|tazidime|pirome|aclor)|penicillin|amoxicillin|ampicillin|cloxacillin|flucloxacillin|piperacillin|tazobactam|meropenem|imipenem|ertapenem|vancomycin|teicoplanin|linezolid|daptomycin|azithromycin|clarithromycin|erythromycin|doxycycline|tetracycline|minocycline|ciprofloxacin|levofloxacin|moxifloxacin|ofloxacin|norfloxacin|metronidazole|clindamycin|gentamicin|amikacin|tobramycin|colistin|polymyxin|cotrimoxazole|trimethoprim|nitrofurantoin|fosfomycin|rifampicin|rifampin)\b/i.test(String(value || ""));
}
function source(label: string, at: Date | string | null | undefined, title: string): Source {
  return { label, at: dateTimeLabel(at), title: safeText(title, 140) || label };
}
function noData(label: string) {
  return label + " are not documented in the available chart records. The answer cannot be determined reliably from the information currently recorded.";
}
function metaOf(value: { meta?: string | null } | null | undefined): Record<string, any> {
  try {
    const parsed = value?.meta ? JSON.parse(value.meta) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function todayIst(): string {
  return istParts(new Date())?.date || new Date().toISOString().slice(0, 10);
}
function effectiveLabTime(lab: { resultedAt?: Date | null; updatedAt?: Date | null; orderedAt?: Date | null; createdAt?: Date | null }) {
  return lab.resultedAt || lab.updatedAt || lab.orderedAt || lab.createdAt || null;
}

async function answerQuestion(
  patientId: string,
  clinicId: string,
  questionId: string,
  patient: PatientContext,
): Promise<Answer> {
  const clinicMembers = await prisma.clinicMember.findMany({
    where: { clinicId, isActive: true },
    select: { doctorId: true },
  });
  const doctorIds = Array.from(new Set(clinicMembers.map((member) => member.doctorId)));
  const [notes, encounters, prescriptions, labs, diagnostics, recentAdministrations, earliestAdministrations, auditLogs] = await Promise.all([
    prisma.clinicalNote.findMany({
      where: { patientId, clinicId }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, noteType: true, title: true, content: true, status: true, createdAt: true, updatedAt: true },
    }),
    prisma.encounter.findMany({
      where: { patientId }, orderBy: { createdAt: "desc" }, take: 100,
      select: {
        id: true, date: true, chiefComplaint: true, clinicalNotes: true, diagnosis: true,
        assessment: true, plan: true, bp: true, pulse: true, temperature: true,
        spo2: true, rr: true, weight: true, height: true, createdAt: true, updatedAt: true,
        status: true, cancelledAt: true,
      },
    }),
    prisma.prescription.findMany({
      where: { patientId }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, medicines: true, status: true, cancelledAt: true, createdAt: true, updatedAt: true },
    }),
    prisma.labOrder.findMany({
      where: { patientId }, orderBy: { orderedAt: "desc" }, take: 100,
      select: {
        id: true, testName: true, category: true, status: true, result: true, notes: true,
        orderedAt: true, resultedAt: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.diagnosticOrder.findMany({
      where: { patientId }, orderBy: { orderedAt: "desc" }, take: 100,
      select: {
        id: true, studyName: true, modality: true, status: true, findings: true, impression: true,
        notes: true, orderedAt: true, performedAt: true, reportedAt: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.medicationAdministration.findMany({
      where: { patientId, clinicId }, orderBy: { scheduledAt: "desc" }, take: 200,
      select: {
        id: true, medicationText: true, medicationName: true, dose: true, doseUnit: true,
        route: true, frequency: true, scheduledAt: true, actualAt: true, status: true,
        reason: true, notes: true, createdAt: true, prescriptionId: true,
      },
    }),
    questionId === "antibiotic-day"
      ? prisma.medicationAdministration.findMany({
          where: { patientId, clinicId, status: "ADMINISTERED", actualAt: { not: null } },
          orderBy: { actualAt: "asc" },
          take: 2000,
          select: {
            id: true, medicationText: true, medicationName: true, dose: true, doseUnit: true,
            route: true, frequency: true, scheduledAt: true, actualAt: true, status: true,
            reason: true, notes: true, createdAt: true, prescriptionId: true,
          },
        })
      : Promise.resolve([]),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: patientId },
          { doctorId: { in: doctorIds }, entity: { in: ["NursingVital", "IPDHandover", "ClinicalNote", "Patient", "RoomTransfer"] } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, doctorId: true, action: true, entity: true, entityId: true, meta: true, createdAt: true },
    }),
  ]);

  const administrations = questionId === "antibiotic-day"
    ? [...new Map([...earliestAdministrations, ...recentAdministrations].map((row) => [row.id, row])).values()]
    : recentAdministrations;
  const sources: Source[] = [];
  let answer = "";
  const now = new Date();

  if (questionId === "antibiotic-day" || questionId === "last-antibiotic-dose") {
    const administered = administrations.filter((a) =>
      String(a.status).toUpperCase() === "ADMINISTERED" && !!a.actualAt &&
      isAntibiotic(String(a.medicationName) + " " + String(a.medicationText)),
    ).sort((a, b) => new Date(a.actualAt!).getTime() - new Date(b.actualAt!).getTime());

    if (!administered.length) {
      const ordered = prescriptions.filter((p) => isAntibiotic(p.medicines) && !p.cancelledAt);
      answer = ordered.length
        ? "An antibiotic appears in the prescription record, but no administered antibiotic dose with an actual administration timestamp was found in this patient's MAR. Do not infer a therapy day from the prescription alone; verify the MAR."
        : noData("Administered antibiotic doses");
      ordered.slice(0, 5).forEach((p) => sources.push(source("Prescription", p.createdAt, p.medicines)));
    } else if (questionId === "last-antibiotic-dose") {
      const last = administered[administered.length - 1];
      answer = "Last documented administered antibiotic: " + safeText(last.medicationName || last.medicationText) +
        (last.dose ? " · " + safeText(last.dose) + " " + safeText(last.doseUnit) : "") +
        (last.route ? " · " + safeText(last.route) : "") +
        ". Actual administration: " + dateTimeLabel(last.actualAt) + ". MAR status: " + safeText(last.status) + ".";
      sources.push(source("Medication Administration Record", last.actualAt, safeText(last.medicationName) + " · " + safeText(last.status)));
    } else {
      const groups = new Map<string, typeof administered>();
      for (const item of administered) {
        const key = safeText(item.medicationName || item.medicationText).toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }
      const today = todayIst();
      const lines = [...groups.values()].map((items) => {
        const first = items[0];
        const last = items[items.length - 1];
        const days = dayDifferenceInclusive(istParts(first.actualAt)?.date || "", today);
        const distinctDays = new Set(items.map((a) => istParts(a.actualAt)?.date).filter(Boolean));
        sources.push(source("Medication Administration Record", first.actualAt, "First documented: " + safeText(first.medicationName)));
        sources.push(source("Medication Administration Record", last.actualAt, "Latest documented: " + safeText(last.medicationName)));
        return safeText(first.medicationName || first.medicationText) + ": calendar day " +
          (days === null ? "undetermined" : String(days)) + " from the earliest recorded administered dose available in the MAR query (" +
          dateLabel(first.actualAt) + "); " + items.length + " administered MAR record(s) across " +
          distinctDays.size + " retrieved date(s); latest administration " + dateTimeLabel(last.actualAt) + ".";
      });
      const historicDischarge = patient.status.trim().toUpperCase() === "DISCHARGED";
      answer = lines.join("\n") +
        (historicDischarge
          ? "\n\nThe patient is currently marked DISCHARGED. These are historic calendar-day counts from recorded MAR data, not a claim that antibiotic treatment is still ongoing. Verify the course-specific order, documented stop/change date, complete MAR, transfer records, and outside-hospital doses before documenting a therapy day."
          : "\n\nThis is an inclusive calendar-day count from the earliest matching administered MAR record retrieved by this query, not proof of uninterrupted therapy or antibiotic appropriateness. Verify the course-specific order, documented stop/change date, complete MAR, transfer records, and any outside-hospital doses before documenting the antibiotic day.");
    }
  } else if (questionId === "missed-doses") {
    const nowMs = now.getTime();
    const events = administrations.filter((a) => {
      const status = String(a.status).toUpperCase();
      if (["HELD", "OMITTED", "REFUSED", "MISSED", "DELAYED"].includes(status)) return true;
      return status === "SCHEDULED" && new Date(a.scheduledAt).getTime() < nowMs - 2 * 60 * 60 * 1000;
    }).sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()).slice(0, 20);
    if (!events.length) {
      answer = "No held, omitted, refused, missed or delayed doses were found in the retrieved MAR entries. This does not prove that every dose was administered; review the full MAR for completeness.";
    } else {
      answer = events.map((a) =>
        safeText(a.medicationName || a.medicationText) +
        (a.dose ? " · " + safeText(a.dose) + " " + safeText(a.doseUnit) : "") +
        " · " + dateTimeLabel(a.scheduledAt) + " · " + String(a.status).toUpperCase() +
        (a.reason ? " · reason: " + safeText(a.reason, 180) : "") +
        (String(a.status).toUpperCase() === "SCHEDULED" ? " · past scheduled time; administration status remains unconfirmed" : ""),
      ).join("\n");
      events.forEach((a) => sources.push(source("Medication Administration Record", a.scheduledAt, safeText(a.medicationName) + " · " + safeText(a.status))));
    }
  } else if (questionId === "current-medications") {
    const active = prescriptions.filter((p) => !p.cancelledAt && !/cancel|discontinued|stopped/i.test(String(p.status)));
    answer = active.length
      ? active.slice(0, 30).map((p) => safeText(p.medicines, 800) + " · status: " + safeText(p.status) + " · ordered " + dateTimeLabel(p.createdAt)).join("\n")
      : noData("Active prescription orders");
    active.slice(0, 15).forEach((p) => sources.push(source("Prescription", p.createdAt, "Prescription status: " + p.status)));
    answer += "\n\nA prescription is an order, not proof of dispensing or administration. Use the MAR for doses actually given.";
  } else if (questionId === "creatinine-trend") {
    const rows = labs.filter((l) => /creatinine/i.test(l.testName) && safeText(l.result))
      .sort((a, b) => new Date(effectiveLabTime(a) || 0).getTime() - new Date(effectiveLabTime(b) || 0).getTime());
    answer = rows.length
      ? rows.slice(-12).map((l) => safeText(l.testName) + ": " + safeText(l.result, 200) + " · " +
          dateTimeLabel(effectiveLabTime(l)) + " · " + safeText(l.status)).join("\n")
      : noData("Creatinine results");
    rows.slice(-12).forEach((l) => sources.push(source("Laboratory result", effectiveLabTime(l), l.testName)));
    if (rows.length < 2) answer += "\n\nFewer than two documented creatinine results are available, so a trend cannot be established from this record.";
    answer += "\n\nValues are presented as recorded. Confirm units, collection times, baseline renal function and clinical context; this display is not an AKI diagnosis or dosing recommendation.";
  } else if (questionId === "latest-labs") {
    const rows = [...labs].sort((a, b) =>
      new Date(effectiveLabTime(b) || 0).getTime() - new Date(effectiveLabTime(a) || 0).getTime(),
    ).slice(0, 15);
    answer = rows.length
      ? rows.map((l) => safeText(l.testName) + ": " + (safeText(l.result) || "No result recorded") + " · " +
          safeText(l.status) + " · " + dateTimeLabel(effectiveLabTime(l))).join("\n")
      : noData("Laboratory orders/results");
    rows.forEach((l) => sources.push(source("Laboratory", effectiveLabTime(l), l.testName)));
  } else if (questionId === "latest-vitals") {
    const chartRows: Array<{ at: Date; label: string; values: string }> = [];
    for (const e of encounters) {
      const values = [
        e.bp ? "BP " + safeText(e.bp) : "",
        e.pulse ? "Pulse " + safeText(e.pulse) : "",
        e.rr ? "RR " + safeText(e.rr) : "",
        e.spo2 ? "SpO₂ " + safeText(e.spo2) : "",
        e.temperature ? "Temperature " + safeText(e.temperature) : "",
        e.weight ? "Weight " + safeText(e.weight) : "",
        e.height ? "Height " + safeText(e.height) : "",
      ].filter(Boolean).join(" · ");
      if (values) chartRows.push({ at: e.createdAt, label: "Encounter vitals", values });
    }
    for (const log of auditLogs) {
      const meta = metaOf(log);
      const logClinic = safeText(meta.clinicId);
      const belongs = log.entityId === patientId || safeText(meta.patientId) === patientId;
      if (log.entity !== "NursingVital" || !belongs || (logClinic && logClinic !== clinicId)) continue;
      const values = [
        meta.bp ? "BP " + safeText(meta.bp) : "",
        meta.pulse ? "Pulse " + safeText(meta.pulse) : "",
        meta.rr ? "RR " + safeText(meta.rr) : "",
        meta.spo2 ? "SpO₂ " + safeText(meta.spo2) : "",
        meta.temperature ? "Temperature " + safeText(meta.temperature) : "",
        meta.findings ? "Findings / precautions: " + safeText(meta.findings, 250) : "",
        meta.assessment ? "Assessment: " + safeText(meta.assessment, 250) : "",
      ].filter(Boolean).join(" · ");
      if (values) chartRows.push({ at: log.createdAt, label: "Nursing observation", values });
    }
    chartRows.sort((a, b) => b.at.getTime() - a.at.getTime());
    const rows = chartRows.slice(0, 10);
    answer = rows.length
      ? rows.map((row) => row.values + " · " + row.label + " · recorded " + dateTimeLabel(row.at)).join("\n")
      : noData("Recorded vital signs");
    rows.forEach((row) => sources.push(source(row.label, row.at, "Recorded observations")));
    answer += "\n\nThese are recorded observations only. Check the original nursing/encounter chart for measurement context and any corrections.";
  } else if (questionId === "pending-investigations") {
    const pendingLabs = labs.filter((l) => {
      const status = String(l.status).toLowerCase();
      return !safeText(l.result) && !l.resultedAt && !/cancel|reject|completed|resulted|reported|final/i.test(status);
    });
    const pendingDiagnostics = diagnostics.filter((d) => {
      const status = String(d.status).toLowerCase();
      return !safeText(d.findings) && !safeText(d.impression) && !d.reportedAt &&
        !/cancel|reject|completed|reported|final/i.test(status);
    });
    const lines = [
      ...pendingLabs.map((l) => "Laboratory · " + safeText(l.testName) + " · " + safeText(l.status) + " · ordered " + dateTimeLabel(l.orderedAt)),
      ...pendingDiagnostics.map((d) => "Diagnostics · " + safeText(d.studyName) + " (" + safeText(d.modality) + ") · " + safeText(d.status) + " · ordered " + dateTimeLabel(d.orderedAt)),
    ].slice(0, 40);
    answer = lines.length ? lines.join("\n") :
      "No clearly pending investigations were identified in the retrieved records. Confirm against the department's live worklist; the query only sees orders associated with this patient.";
    pendingLabs.slice(0, 25).forEach((l) => sources.push(source("Laboratory order", l.orderedAt, l.testName)));
    pendingDiagnostics.slice(0, 15).forEach((d) => sources.push(source("Diagnostic order", d.orderedAt, d.studyName)));
  } else if (questionId === "last-24-hours") {
    const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
    const events: Array<{ at: Date; label: string; detail: string }> = [];
    for (const n of notes) {
      if (new Date(n.createdAt).getTime() < cutoff) continue;
      events.push({ at: n.createdAt, label: "Clinical note · " + safeText(n.noteType || n.title), detail: safeText(n.content, 900) });
    }
    for (const e of encounters) {
      if (new Date(e.createdAt).getTime() < cutoff || e.cancelledAt) continue;
      const detail = [
        e.chiefComplaint ? "Complaint: " + safeText(e.chiefComplaint) : "",
        e.diagnosis ? "Diagnosis: " + safeText(e.diagnosis) : "",
        e.assessment ? "Assessment: " + safeText(e.assessment) : "",
        e.plan ? "Plan: " + safeText(e.plan) : "",
        e.clinicalNotes ? "Notes: " + safeText(e.clinicalNotes, 500) : "",
        e.bp ? "BP " + safeText(e.bp) : "",
        e.pulse ? "Pulse " + safeText(e.pulse) : "",
        e.temperature ? "Temperature " + safeText(e.temperature) : "",
        e.spo2 ? "SpO₂ " + safeText(e.spo2) : "",
      ].filter(Boolean).join(" · ");
      if (detail) events.push({ at: e.createdAt, label: "Clinical encounter", detail });
    }
    for (const l of labs) {
      const at = effectiveLabTime(l);
      if (!at || new Date(at).getTime() < cutoff) continue;
      events.push({ at: new Date(at), label: "Lab · " + safeText(l.testName) + " (" + safeText(l.status) + ")", detail: safeText(l.result || l.notes || "No result recorded") });
    }
    for (const d of diagnostics) {
      const at = d.reportedAt || d.performedAt || d.orderedAt;
      if (!at || new Date(at).getTime() < cutoff) continue;
      events.push({ at: new Date(at), label: "Diagnostic · " + safeText(d.studyName) + " (" + safeText(d.status) + ")", detail: safeText(d.impression || d.findings || d.notes || "No report detail recorded") });
    }
    for (const a of administrations) {
      const at = a.actualAt || a.scheduledAt;
      if (!at || new Date(at).getTime() < cutoff) continue;
      events.push({ at: new Date(at), label: "MAR · " + safeText(a.medicationName), detail: safeText(a.dose) + " " + safeText(a.doseUnit) + " · " + safeText(a.status) + (a.reason ? " · " + safeText(a.reason, 150) : "") });
    }
    const canonicalNoteIds = new Set(notes.map((n) => n.id));
    for (const log of auditLogs) {
      if (new Date(log.createdAt).getTime() < cutoff) continue;
      const meta = metaOf(log);
      const logClinic = safeText(meta.clinicId);
      if (logClinic && logClinic !== clinicId) continue;
      const belongs = log.entityId === patientId || safeText(meta.patientId) === patientId;
      if (!belongs) continue;
      if (log.entity === "NursingVital") {
        const detail = [
          meta.bp ? "BP " + safeText(meta.bp) : "",
          meta.pulse ? "Pulse " + safeText(meta.pulse) : "",
          meta.rr ? "RR " + safeText(meta.rr) : "",
          meta.spo2 ? "SpO₂ " + safeText(meta.spo2) : "",
          meta.temperature ? "Temperature " + safeText(meta.temperature) : "",
          meta.findings ? "Findings / precautions: " + safeText(meta.findings, 400) : "",
          meta.assessment ? "Assessment: " + safeText(meta.assessment, 300) : "",
          meta.notes ? "Notes: " + safeText(meta.notes, 300) : "",
        ].filter(Boolean).join(" · ");
        if (detail) events.push({ at: log.createdAt, label: "Nursing observation", detail });
      } else if (log.entity === "IPDHandover") {
        const detail = [
          meta.receivingTeam ? "Receiving team: " + safeText(meta.receivingTeam) : "",
          meta.receivingRole ? "Receiving role: " + safeText(meta.receivingRole) : "",
          meta.context ? "Handover: " + safeText(meta.context, 600) : "",
        ].filter(Boolean).join(" · ");
        events.push({ at: log.createdAt, label: "Clinical handover", detail: detail || "Handover record" });
      } else if (log.entity === "ClinicalNote" && typeof meta.content === "string" && meta.content.trim()) {
        if (meta.noteId && canonicalNoteIds.has(String(meta.noteId))) continue;
        if (/^case summary$/i.test(String(meta.noteType || ""))) continue;
        events.push({ at: log.createdAt, label: "Legacy clinical note · " + safeText(meta.noteType || meta.title), detail: safeText(meta.content, 800) });
      } else if (log.entity === "RoomTransfer") {
        events.push({ at: log.createdAt, label: "Room / ward transfer", detail: safeText(meta.reason || meta.roomNumber || "Transfer recorded") });
      }
    }
    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    const rows = events.slice(0, 25);
    answer = rows.length
      ? rows.map((e) => dateTimeLabel(e.at) + " · " + e.label + ": " + (e.detail || "Details not recorded")).join("\n")
      : "No dated clinical notes, encounters, laboratory/diagnostic events or MAR entries were found in the last 24 hours in the retrieved records. Confirm timestamps and the source chart before concluding that no clinical events occurred.";
    rows.forEach((e) => sources.push(source(e.label.split(" · ")[0], e.at, e.label)));
  } else if (ADDITIONAL_QUESTION_IDS.has(questionId)) {
    const textRecords = [
      ...notes.map((n) => ({
        at: n.updatedAt || n.createdAt, kind: "Clinical note", title: safeText(n.title || n.noteType || "Clinical note"),
        status: safeText(n.status), text: [n.title, n.noteType, n.content, n.status].map((v) => safeText(v, 1400)).filter(Boolean).join(" · "),
      })),
      ...encounters.filter((e) => !e.cancelledAt).map((e) => ({
        at: e.updatedAt || e.createdAt, kind: "Clinical encounter", title: safeText(e.diagnosis || e.chiefComplaint || "Encounter"),
        status: safeText(e.status), text: [e.chiefComplaint, e.diagnosis, e.assessment, e.plan, e.clinicalNotes].map((v) => safeText(v, 1200)).filter(Boolean).join(" · "),
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const matchingNarratives = (pattern: RegExp, limit = 8) =>
      textRecords.filter((item) => pattern.test(item.title + " " + item.text)).slice(0, limit);
    const showNarratives = (rows: typeof textRecords, notFound: string) => {
      if (!rows.length) return notFound;
      rows.forEach((item) => sources.push(source(item.kind, item.at, item.title + (item.status ? " · " + item.status : ""))));
      return rows.map((item) => dateTimeLabel(item.at) + " · " + item.kind + (item.status ? " · " + item.status : "") +
        " · " + (item.text || "No note content recorded").slice(0, 700)).join("\n");
    };
    const matchingLabs = (pattern: RegExp, limit = 15) =>
      labs.filter((l) => pattern.test([l.testName, l.category, l.result, l.status, l.notes].map((v) => safeText(v, 300)).join(" ")))
        .sort((a, b) => new Date(effectiveLabTime(b) || 0).getTime() - new Date(effectiveLabTime(a) || 0).getTime()).slice(0, limit);
    const showLabs = (rows: typeof labs, emptyText: string) => {
      if (!rows.length) return emptyText;
      rows.forEach((l) => sources.push(source("Laboratory", effectiveLabTime(l), safeText(l.testName))));
      return rows.map((l) => safeText(l.testName) + ": " + (safeText(l.result, 350) || "No result recorded") +
        " · " + safeText(l.status) + " · " + dateTimeLabel(effectiveLabTime(l)) +
        (l.notes ? " · note: " + safeText(l.notes, 220) : "")).join("\n");
    };
    const recentAntibioticDoses = administrations.filter((a) =>
      String(a.status).toUpperCase() === "ADMINISTERED" && !!a.actualAt &&
      isAntibiotic(String(a.medicationName) + " " + String(a.medicationText)))
      .sort((a, b) => new Date(b.actualAt!).getTime() - new Date(a.actualAt!).getTime()).slice(0, 8);

    switch (questionId) {
      case "mar-last-24h": {
        const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
        const rows = administrations.filter((a) => String(a.status).toUpperCase() === "ADMINISTERED" &&
          a.actualAt && new Date(a.actualAt).getTime() >= cutoff)
          .sort((a, b) => new Date(b.actualAt!).getTime() - new Date(a.actualAt!).getTime()).slice(0, 40);
        answer = rows.length ? rows.map((a) => {
          sources.push(source("Medication Administration Record", a.actualAt, safeText(a.medicationName || a.medicationText)));
          return safeText(a.medicationName || a.medicationText) + (a.dose ? " · " + safeText(a.dose) + " " + safeText(a.doseUnit) : "") +
            (a.route ? " · " + safeText(a.route) : "") + " · administered " + dateTimeLabel(a.actualAt);
        }).join("\n") : noData("Administered medication doses in the last 24 hours");
        answer += "\n\nOnly retrieved MAR entries with status ADMINISTERED and an actual timestamp are listed; confirm the full MAR.";
        break;
      }
      case "pending-doses": {
        const rows = administrations.filter((a) => ["SCHEDULED", "PENDING", "DUE", "IN_PROGRESS"].includes(String(a.status).toUpperCase()) &&
          new Date(a.scheduledAt).getTime() <= now.getTime())
          .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()).slice(0, 30);
        answer = rows.length ? rows.map((a) => {
          sources.push(source("Medication Administration Record", a.scheduledAt, safeText(a.medicationName || a.medicationText) + " · " + safeText(a.status)));
          const hours = Math.floor(Math.max(0, now.getTime() - new Date(a.scheduledAt).getTime()) / 3600000);
          return safeText(a.medicationName || a.medicationText) + (a.dose ? " · " + safeText(a.dose) + " " + safeText(a.doseUnit) : "") +
            " · scheduled " + dateTimeLabel(a.scheduledAt) + " · MAR status " + safeText(a.status) +
            (hours >= 2 ? " · scheduled time passed by about " + hours + " hour(s); verify promptly" : " · scheduled time has passed; verify status");
        }).join("\n") : "No due/past-due MAR entries in the retrieved records remain in a SCHEDULED, PENDING, DUE or IN_PROGRESS state. This is not proof that all medications were administered; check the full MAR.";
        break;
      }
      case "antibiotic-review": {
        const orders = prescriptions.filter((p) => isAntibiotic(p.medicines) && !p.cancelledAt && !/cancel|discontinued|stopped/i.test(String(p.status)));
        const cultures = matchingLabs(/culture|microbiology|sensitivity|susceptib|organism|gram stain|blood culture|urine culture|sputum/i, 10);
        const lines: string[] = ["Documented active antibiotic prescription text:",
          orders.length ? orders.slice(0, 10).map((p) => {
            sources.push(source("Prescription", p.createdAt, "Antibiotic order · " + safeText(p.status)));
            return safeText(p.medicines, 650) + " · status " + safeText(p.status) + " · ordered " + dateTimeLabel(p.createdAt);
          }).join("\n") : "No active antibiotic prescription was identified by the medication-name matcher. This does not rule out an unrecognised drug name.",
          "\nMost recent documented administered antibiotic doses:",
          recentAntibioticDoses.length ? recentAntibioticDoses.map((a) => {
            sources.push(source("Medication Administration Record", a.actualAt, safeText(a.medicationName || a.medicationText)));
            return safeText(a.medicationName || a.medicationText) + (a.dose ? " · " + safeText(a.dose) + " " + safeText(a.doseUnit) : "") + " · " + dateTimeLabel(a.actualAt);
          }).join("\n") : "No administered antibiotic dose with an actual timestamp was identified in the retrieved MAR.",
          "\nRelated microbiology / culture records:",
          cultures.length ? showLabs(cultures, "") : "No matching culture or microbiology result was found in the retrieved lab orders."];
        answer = lines.join("\n") + "\n\nRecord summary only. Review indication, planned duration, culture results, response, route and local antimicrobial policy with the responsible clinician; this tool does not judge appropriateness.";
        break;
      }
      case "medication-reconciliation": {
        const active = prescriptions.filter((p) => !p.cancelledAt && !/cancel|discontinued|stopped/i.test(String(p.status))).slice(0, 15);
        const mar = administrations.slice(0, 20);
        const a = active.length ? active.map((p) => {
          sources.push(source("Prescription", p.createdAt, "Status " + safeText(p.status)));
          return safeText(p.medicines, 650) + " · prescription status " + safeText(p.status) + " · " + dateTimeLabel(p.createdAt);
        }).join("\n") : "No active prescription orders were identified in the retrieved prescription records.";
        const b = mar.length ? mar.map((m) => {
          sources.push(source("Medication Administration Record", m.scheduledAt, safeText(m.medicationName || m.medicationText) + " · " + safeText(m.status)));
          return safeText(m.medicationName || m.medicationText) + (m.dose ? " · " + safeText(m.dose) + " " + safeText(m.doseUnit) : "") +
            " · " + safeText(m.status) + " · scheduled " + dateTimeLabel(m.scheduledAt) + (m.actualAt ? " · actual " + dateTimeLabel(m.actualAt) : "");
        }).join("\n") : "No MAR entries were found in the retrieved set.";
        answer = "Prescription orders (not proof of administration):\n" + a + "\n\nRecent MAR entries:\n" + b +
          "\n\nThe two record types may contain free text. This panel does not automatically declare them equivalent or confirm a discrepancy. Reconcile name, dose, route, frequency, dates, held/ceased orders and transfer medicines manually against the authoritative chart.";
        break;
      }
      case "vte-prophylaxis": {
        const meds = prescriptions.filter((p) => /\b(enoxaparin|dalteparin|heparin|fondaparinux|apixaban|rivaroxaban|edoxaban|dabigatran|mechanical prophylaxis|compression device|ipc|scd|vte|dvt|thromboprophylaxis|venous thromboembolism)\b/i.test(String(p.medicines || "")));
        const narrative = matchingNarratives(/\b(vte|dvt|thromboprophylaxis|venous thromboembolism|intermittent pneumatic compression|compression stockings|mechanical prophylaxis)\b/i, 8);
        const medText = meds.length ? meds.slice(0, 10).map((p) => {
          sources.push(source("Prescription", p.createdAt, "Medication status " + safeText(p.status)));
          return safeText(p.medicines, 650) + " · status " + safeText(p.status) + " · " + dateTimeLabel(p.createdAt);
        }).join("\n") : "No matching prophylaxis-related prescription text was found.";
        answer = "Prescription mentions (not a determination of indication, dose or adequacy):\n" + medText +
          "\n\nNarrative chart mentions:\n" + showNarratives(narrative, "No matching VTE/DVT prophylaxis wording was found in retrieved notes/encounters.") +
          "\n\nThis does not confirm that prophylaxis is indicated, contraindicated, administered or adequate. Verify the documented VTE/bleeding-risk assessment, active orders, MAR and local protocol.";
        break;
      }
      case "cbc-results":
        answer = showLabs(matchingLabs(/\b(cbc|complete blood count|hemogram|haemogram|hemoglobin|haemoglobin|\bhb\b|wbc|white blood cell|leukocyte|leucocyte|\btlc\b|platelet|hematocrit|haematocrit|pcv|neutrophil|lymphocyte)\b/i, 20), noData("CBC / blood count test results"));
        break;
      case "hemoglobin-trend":
        answer = showLabs(matchingLabs(/hemoglobin|haemoglobin|\bhb\b|hematocrit|haematocrit|pcv/i, 15), noData("Hemoglobin / Hb / hematocrit results")) +
          "\n\nValues are listed as recorded; confirm units, collection times, reference range and clinical context. This is not a transfusion recommendation.";
        break;
      case "wbc-trend":
        answer = showLabs(matchingLabs(/\bwbc\b|white blood cell|leukocyte|leucocyte|\btlc\b|neutrophil/i, 15), noData("WBC / TLC / leukocyte results")) +
          "\n\nValues are listed as recorded; interpret any trend with clinical context.";
        break;
      case "electrolyte-trend":
        answer = showLabs(matchingLabs(/\bsodium\b|\bna\b|\bpotassium\b|\bk\b|\bchloride\b|\bcl\b|bicarbonate|total co2|magnesium|phosphate|phosphorus|calcium|electrolyte/i, 25), noData("Sodium, potassium or other electrolyte results")) +
          "\n\nCheck units and specimen/collection time before interpretation. No electrolyte abnormality or treatment recommendation is inferred.";
        break;
      case "glucose-results":
        answer = showLabs(matchingLabs(/glucose|blood sugar|\bfbs\b|\brbs\b|\bppbs\b|\bpp\b|fasting sugar|post.?prandial|hba1c|glycated hemoglobin/i, 20), noData("Glucose / blood sugar results")) +
          "\n\nConfirm test type, meal timing, units and source chart before interpretation.";
        break;
      case "abnormal-labs": {
        const marked = labs.filter((l) => /\b(high|low|abnormal|critical|panic|flagged|hh|ll)\b|[↑↓]|(?:^|\s)[*!](?:\s|$)/i.test(
          [l.status, l.result, l.notes].map((v) => safeText(v, 350)).join(" "),
        )).sort((a, b) => new Date(effectiveLabTime(b) || 0).getTime() - new Date(effectiveLabTime(a) || 0).getTime()).slice(0, 25);
        answer = showLabs(marked, "No retrieved laboratory entry was explicitly marked high, low, abnormal or critical in the fields searched. This query cannot independently determine normality from raw values or reference ranges.") +
          "\n\nCheck the laboratory system for critical-call status, reference ranges, units and acknowledgement. A missing flag is not evidence of a normal result.";
        break;
      }
      case "latest-imaging": {
        const rows = [...diagnostics].sort((a, b) =>
          new Date(b.reportedAt || b.performedAt || b.orderedAt || b.createdAt).getTime() -
          new Date(a.reportedAt || a.performedAt || a.orderedAt || a.createdAt).getTime()).slice(0, 15);
        answer = rows.length ? rows.map((d) => {
          const at = d.reportedAt || d.performedAt || d.orderedAt || d.createdAt;
          sources.push(source("Diagnostic report/order", at, safeText(d.studyName) + " · " + safeText(d.status)));
          return safeText(d.studyName) + (d.modality ? " · " + safeText(d.modality) : "") + " · " + safeText(d.status) +
            " · reported/performed/ordered " + dateTimeLabel(at) +
            (d.impression ? "\nImpression: " + safeText(d.impression, 700) : "") +
            (d.findings ? "\nFindings: " + safeText(d.findings, 700) : "") +
            (!d.impression && !d.findings && d.notes ? "\nNotes: " + safeText(d.notes, 500) : "");
        }).join("\n\n") : noData("Imaging / diagnostic orders and reports");
        answer += "\n\nConfirm the final signed report and images in the diagnostic system where applicable.";
        break;
      }
      case "microbiology-results": {
        const rows = matchingLabs(/culture|microbiology|sensitivity|susceptib|organism|gram stain|blood culture|urine culture|sputum|wound swab|mrsa|afb|fungal/i, 20);
        answer = showLabs(rows, noData("Culture / microbiology / sensitivity records")) +
          "\n\nSome microbiology may be stored outside the lab-order module; check the live lab system for pending cultures and final sensitivities.";
        break;
      }
      case "infection-workup": {
        const related = matchingLabs(/culture|microbiology|sensitivity|susceptib|organism|gram stain|blood culture|urine culture|sputum|wound swab|mrsa|afb|procalcitonin|c.?reactive protein|lactate/i, 12);
        const antibiotics = prescriptions.filter((p) => isAntibiotic(p.medicines) && !p.cancelledAt).slice(0, 8);
        const abx = antibiotics.length ? antibiotics.map((p) => {
          sources.push(source("Prescription", p.createdAt, safeText(p.status)));
          return safeText(p.medicines, 600) + " · " + safeText(p.status) + " · " + dateTimeLabel(p.createdAt);
        }).join("\n") : "No active antibiotic prescription text matched the lookup.";
        answer = "Antibiotic prescription text:\n" + abx + "\n\nRelated laboratory records:\n" +
          showLabs(related, "No culture/microbiology or selected inflammatory-marker records matched the search.") +
          "\n\nThis is a record summary only. It does not diagnose infection or judge antibiotic choice. Confirm source, collection times, final reports, response and local protocols.";
        break;
      }
      case "latest-assessment-plan": {
        const latest = encounters.find((e) => !e.cancelledAt);
        if (latest) {
          sources.push(source("Clinical encounter", latest.updatedAt || latest.createdAt, safeText(latest.diagnosis || latest.chiefComplaint || "Latest encounter")));
          answer = ["Encounter recorded: " + dateTimeLabel(latest.date || latest.createdAt), "Status: " + safeText(latest.status || "Not recorded"),
            "Presenting complaint: " + safeText(latest.chiefComplaint || "Not recorded"), "Diagnosis: " + safeText(latest.diagnosis || "Not recorded"),
            "Assessment: " + safeText(latest.assessment || "Not recorded"), "Plan: " + safeText(latest.plan || "Not recorded"),
            "Clinical notes: " + safeText(latest.clinicalNotes || "Not recorded", 1200)].join("\n");
        } else answer = noData("Non-cancelled clinical encounters");
        answer += "\n\nUse the authoritative signed note/plan for decisions; a missing field here does not establish that an assessment was not performed.";
        break;
      }
      case "latest-note": {
        const rows = notes.slice(0, 8);
        answer = rows.length ? rows.map((n) => {
          sources.push(source("Clinical note", n.updatedAt || n.createdAt, safeText(n.title || n.noteType) + " · " + safeText(n.status)));
          return dateTimeLabel(n.updatedAt || n.createdAt) + " · " + safeText(n.noteType || n.title || "Clinical note") +
            " · recorded status " + safeText(n.status) + "\n" + safeText(n.content, 900);
        }).join("\n\n") : noData("Clinical notes");
        answer += "\n\nDraft, signed, amended and cancelled status labels are reported as stored. Confirm the finalised version and audit trail before relying on a note.";
        break;
      }
      case "nursing-observations": {
        const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
        const rows = auditLogs.filter((log) => {
          if (log.entity !== "NursingVital" || new Date(log.createdAt).getTime() < cutoff) return false;
          const meta = metaOf(log); const logClinic = safeText(meta.clinicId);
          return (!logClinic || logClinic === clinicId) && (log.entityId === patientId || safeText(meta.patientId) === patientId);
        }).slice(0, 20);
        answer = rows.length ? rows.map((log) => {
          const meta = metaOf(log);
          sources.push(source("Nursing observation", log.createdAt, "Recorded vital signs / nursing assessment"));
          return dateTimeLabel(log.createdAt) + " · " + [
            meta.bp ? "BP " + safeText(meta.bp) : "", meta.pulse ? "Pulse " + safeText(meta.pulse) : "",
            meta.rr ? "RR " + safeText(meta.rr) : "", meta.spo2 ? "SpO₂ " + safeText(meta.spo2) : "",
            meta.temperature ? "Temperature " + safeText(meta.temperature) : "",
            meta.findings ? "Findings " + safeText(meta.findings, 400) : "",
            meta.assessment ? "Assessment " + safeText(meta.assessment, 400) : "",
            meta.notes ? "Notes " + safeText(meta.notes, 400) : "",
          ].filter(Boolean).join(" · ");
        }).join("\n") : "No nursing-vital audit entries explicitly linked to this patient were found in the last 24 hours in the retrieved audit records. Review the live nursing chart; this is not evidence that observations were not taken.";
        break;
      }
      case "latest-handover": {
        const rows = auditLogs.filter((log) => {
          if (log.entity !== "IPDHandover") return false;
          const meta = metaOf(log); const logClinic = safeText(meta.clinicId);
          return (!logClinic || logClinic === clinicId) && (log.entityId === patientId || safeText(meta.patientId) === patientId);
        }).slice(0, 10);
        answer = rows.length ? rows.map((log) => {
          const meta = metaOf(log);
          sources.push(source("Clinical handover", log.createdAt, safeText(meta.receivingTeam || meta.receivingRole || "Handover")));
          return dateTimeLabel(log.createdAt) + " · From: " + safeText(meta.sendingTeam || meta.sendingRole || "Not recorded") +
            " · To: " + safeText(meta.receivingTeam || meta.receivingRole || "Not recorded") +
            "\nSituation / context: " + safeText(meta.context || meta.summary || meta.notes || "No context recorded", 900) +
            (meta.pendingTasks ? "\nPending tasks: " + safeText(meta.pendingTasks, 600) : "");
        }).join("\n\n") : noData("IPD clinical handover records explicitly linked to this patient");
        answer += "\n\nVerify the most recent handover with the receiving nurse/medical team before acting on pending tasks.";
        break;
      }
      case "patient-round-summary": {
        const latest = encounters.find((e) => !e.cancelledAt);
        const active = prescriptions.filter((p) => !p.cancelledAt && !/cancel|discontinued|stopped/i.test(String(p.status)));
        const pendingLabs = labs.filter((l) => !safeText(l.result) && !l.resultedAt && !/cancel|reject|completed|resulted|reported|final/i.test(String(l.status))).slice(0, 8);
        const pendingStudies = diagnostics.filter((d) => !safeText(d.findings) && !safeText(d.impression) && !d.reportedAt && !/cancel|reject|completed|reported|final/i.test(String(d.status))).slice(0, 8);
        answer = ["Patient status: " + safeText(patient.status || "Not recorded"),
          "Allergies: " + (safeText(patient.allergies) || "No allergy information recorded — verify directly"),
          "Latest diagnosis: " + safeText(latest?.diagnosis || "Not recorded"),
          "Latest assessment: " + safeText(latest?.assessment || "Not recorded", 700),
          "Latest plan: " + safeText(latest?.plan || "Not recorded", 800),
          "Latest encounter time: " + dateTimeLabel(latest?.updatedAt || latest?.createdAt),
          "Active prescription records retrieved: " + active.length + (active.length ? " (see Current medications)" : " (none identified; verify chart)"),
          "Clearly pending lab orders retrieved: " + pendingLabs.length + (pendingLabs.length ? " — " + pendingLabs.map((l) => safeText(l.testName)).join(", ") : ""),
          "Clearly pending diagnostic orders retrieved: " + pendingStudies.length + (pendingStudies.length ? " — " + pendingStudies.map((d) => safeText(d.studyName)).join(", ") : "")].join("\n");
        if (latest) sources.push(source("Clinical encounter", latest.updatedAt || latest.createdAt, safeText(latest.diagnosis || "Latest encounter")));
        pendingLabs.forEach((l) => sources.push(source("Laboratory order", l.orderedAt, l.testName)));
        pendingStudies.forEach((d) => sources.push(source("Diagnostic order", d.orderedAt, d.studyName)));
        answer += "\n\nRound aid only, not a severity score or clinical recommendation. Confirm bedside status, observations, orders, MAR and signed notes. Structured intake/output and device status are not exposed to this panel.";
        break;
      }
      case "cognition-delirium": {
        const rows = matchingNarratives(/\b(confus(?:ion|ed)|delirium|altered sensorium|consciousness|gcs|agitat(?:ion|ed)|disorient(?:ed|ation)|oriented|drowsy|lethargic|hallucination|cognitive|mental status)\b/i, 10);
        answer = showNarratives(rows, "No matching cognition, confusion, consciousness or delirium wording was found. This does not mean the patient is cognitively normal; review bedside assessment and nursing observations.") +
          "\n\nThis panel does not perform a delirium screen or calculate GCS from narrative text.";
        break;
      }
      case "goals-escalation": {
        const rows = matchingNarratives(/\b(code status|dnr|dni|do not resuscitate|do not intubate|resuscitat|goals of care|ceiling of care|escalat|icu review|critical care|rapid response|comfort-focused|palliative)\b/i, 10);
        answer = showNarratives(rows, "No matching escalation, resuscitation or goals-of-care wording was found. Do not infer code status or escalation limits from missing text; check the signed resuscitation / goals-of-care record and local workflow.");
        break;
      }
      case "discharge-plan": {
        const rows = matchingNarratives(/\b(discharge|step.?down|transfer|follow.?up|follow up|disposition|home care|fit for discharge|discharge criteria|review in|clinic appointment|rehabilitation facility)\b/i, 12);
        answer = showNarratives(rows, "No matching discharge, transfer or follow-up wording was found. This is not a discharge-readiness assessment; check the current consultant plan and local discharge checklist.") +
          "\n\nVerify outstanding investigations, medication reconciliation, patient/family instructions, follow-up and final discharge documentation with the responsible team.";
        break;
      }
      case "devices-lines": {
        const rows = matchingNarratives(/\b(catheter|foley|urinary catheter|central line|cvc|picc|peripheral line|iv line|drain|ng tube|feeding tube|peg tube|tracheostomy|ett|endotracheal|ventilator|oxygen therapy|nasal cannula|wound vac|arterial line|dialysis access)\b/i, 12);
        answer = showNarratives(rows, "No line, tube, catheter or respiratory-support terms were found. This does not establish that no devices are present; verify at the bedside and in the nursing/device chart.") +
          "\n\nHistorical mentions may be returned; the text search cannot verify whether a device remains in place or is still indicated.";
        break;
      }
      case "urine-output": {
        const rows = matchingNarratives(/\b(urine|urinary output|urine output|\buo\b|intake.?output|fluid balance|input.?output|\bi\/o\b|diuresis|oliguria|anuria|ml\/kg\/h|fluid restriction|iv fluids)\b/i, 12);
        answer = "Structured intake/output or fluid-balance observations are not queried as a dedicated data series by this Q&A panel.\n\nNarrative chart mentions:\n" +
          showNarratives(rows, "No urine-output or fluid-balance wording was found in retrieved notes/encounters.") +
          "\n\nDo not use narrative text to determine current output or diagnose AKI. Confirm measured output, observation interval, body weight, fluid chart and labs directly.";
        break;
      }
      case "nutrition-plan": {
        const rows = matchingNarratives(/\b(diet|npo|nil by mouth|fasting|oral intake|feeding|enteral|ng feed|tpn|nutrition|swallow|dysphagia|dietitian|fluid allowance|supplement)\b/i, 10);
        answer = showNarratives(rows, "No matching diet, feeding or nutrition wording was found. Verify the active diet/feeding order and nursing intake chart.") +
          "\n\nHistorical note mentions are not proof of the current diet, feed rate, tolerance or swallowing status.";
        break;
      }
      case "mobility-safety": {
        const rows = matchingNarratives(/\b(mobilit|mobilis|mobiliz|ambulat|fall risk|falls|pressure injur|pressure sore|turning|physiotherap|physical therap|bedbound|bed bound|assistive device|walking aid|skin integrity)\b/i, 10);
        answer = showNarratives(rows, "No matching mobility, falls or pressure-injury prevention wording was found. Confirm current nursing risk assessments, mobility status and prevention plan.") +
          "\n\nThis text search does not calculate a falls/pressure-injury score or confirm prevention steps were completed.";
        break;
      }
      case "pain-assessment": {
        const rows = matchingNarratives(/\b(pain|analges|pain score|numeric rating|vas score|flacc|pain relief)\b/i, 10);
        answer = showNarratives(rows, "No matching pain assessment or analgesia wording was found. Assess the patient directly and review the prescribed/administered analgesia record.") +
          "\n\nNarrative mentions may be historical and do not establish current pain severity or response.";
        break;
      }
    }
  } else if (questionId === "allergies-diagnosis") {
    const profile = parsePatientProfile(patient.notes || "") as Record<string, any>;
    const latestEncounter = encounters.find((e) => !e.cancelledAt);
    answer = [
      "Allergies: " + (safeText(patient.allergies) || "No allergy information recorded"),
      "Documented diagnosis: " + safeText(profile.diagnosis || profile.workingDiagnosis || latestEncounter?.diagnosis || "Not recorded"),
      "Presenting complaint: " + safeText(profile.chiefComplaint || latestEncounter?.chiefComplaint || "Not recorded"),
      "Most recent assessment: " + safeText(latestEncounter?.assessment || "Not recorded"),
    ].join("\n");
    if (latestEncounter) sources.push(source("Encounter", latestEncounter.createdAt, latestEncounter.diagnosis || "Clinical assessment"));
  }

  return { answer, sources: sources.slice(0, 30), disclaimer: DISCLAIMER, generatedAt: new Date().toISOString() };
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return fail("Sign in to use Clinical Q&A.", 401);

  const membership = await requireActiveClinicMembership(session.doctorId);
  if (!membership || !canViewFullClinicalChart(membership.role)) {
    return fail("Clinical Q&A is not authorized for this role or clinic.", 403);
  }
  const access = await requireClinicalModule(session.doctorId, "IPD");
  if (!access.allowed || access.clinicId !== membership.clinicId) {
    return fail("IPD access is not included in this clinic's subscription.", 403);
  }

  const params = await context.params;
  const patientId = safeText(params.id, 80);
  if (!patientId) return fail("Invalid patient identifier.", 400);
  const patient = await findAuthorizedPatient(membership, patientId);
  if (!patient) return fail("Patient was not found in the selected clinic.", 404);
  if (parseCareSetting(patient.notes || "") !== "IPD") {
    return fail("Clinical Q&A in this workspace is available only for IPD patients.", 409);
  }

  const body = await req.json().catch(() => ({}));
  const questionId = typeof body.questionId === "string" ? body.questionId : "";
  if (!QUESTION_IDS.has(questionId)) return fail("Choose one of the predefined clinical questions.", 400);

  const limited = await consumeRateLimit(
    authBucketKey("clinical-qa", req, session.doctorId + ":" + membership.clinicId + ":" + patientId),
    30,
    15 * 60 * 1000,
  );
  if (!limited.allowed) {
    const result = rateLimitResponse(limited.retryAfterSec);
    return NextResponse.json(result.body, { status: 429, headers: { ...result.headers, "Cache-Control": "no-store" } });
  }

  try {
    const result = await answerQuestion(patientId, membership.clinicId, questionId, {
      notes: patient.notes || "", allergies: patient.allergies || "", status: patient.status || "UNKNOWN",
    });
    await writeAudit({
      doctorId: session.doctorId,
      clinicId: membership.clinicId,
      action: "CLINICAL_QA_ANSWERED",
      entity: "ClinicalQASession",
      entityId: patientId,
      meta: { patientId, questionId, sourceCount: result.sources.length, answerMode: "deterministic-chart-query", readOnly: true },
    });
    return NextResponse.json({ success: true, questionId, ...result }, {
      headers: { "Cache-Control": "no-store", Vary: "Cookie" },
    });
  } catch (error) {
    console.error("Clinical Q&A failed", error instanceof Error ? error.name : "unknown error");
    return fail("Clinical Q&A could not retrieve the chart records. Refresh the patient chart and try again.", 502);
  }
}
