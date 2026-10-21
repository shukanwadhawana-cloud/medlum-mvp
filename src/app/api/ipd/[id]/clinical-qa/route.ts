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
]);
const IST = "Asia/Kolkata";
const DISCLAIMER =
  "Read-only, chart-derived answer. Verify source entries and timestamps before clinical decisions. Missing documentation is not evidence that an event did not occur. This tool does not diagnose, prescribe, or change the record.";

type Source = { label: string; at: string; title: string };
type Answer = { answer: string; sources: Source[]; disclaimer: string; generatedAt: string };
type PatientContext = { notes: string; allergies: string };

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
  const [notes, encounters, prescriptions, labs, diagnostics, administrations] = await Promise.all([
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
  ]);

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
          (days === null ? "undetermined" : String(days)) + " from first recorded administered dose (" +
          dateLabel(first.actualAt) + "); " + items.length + " administered MAR record(s) across " +
          distinctDays.size + " recorded date(s); latest administration " + dateTimeLabel(last.actualAt) + ".";
      });
      answer = lines.join("\n") +
        "\n\nThis is a calendar-day count from the earliest recorded administration, inclusive—not proof of uninterrupted therapy. Check the complete MAR and any transfers or outside-hospital doses before documenting the antibiotic day.";
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
    const rows = encounters.filter((e) => e.bp || e.pulse || e.temperature || e.spo2 || e.rr || e.weight || e.height)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);
    answer = rows.length ? rows.map((e) => {
      const values = [
        e.bp ? "BP " + safeText(e.bp) : "",
        e.pulse ? "Pulse " + safeText(e.pulse) : "",
        e.rr ? "RR " + safeText(e.rr) : "",
        e.spo2 ? "SpO₂ " + safeText(e.spo2) : "",
        e.temperature ? "Temperature " + safeText(e.temperature) : "",
        e.weight ? "Weight " + safeText(e.weight) : "",
        e.height ? "Height " + safeText(e.height) : "",
      ].filter(Boolean).join(" · ");
      return values + " · recorded " + dateTimeLabel(e.createdAt);
    }).join("\n") : noData("Recorded vital signs");
    rows.forEach((e) => sources.push(source("Encounter / vital signs", e.createdAt, "Recorded observations")));
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
    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    const rows = events.slice(0, 25);
    answer = rows.length
      ? rows.map((e) => dateTimeLabel(e.at) + " · " + e.label + ": " + (e.detail || "Details not recorded")).join("\n")
      : "No dated clinical notes, encounters, laboratory/diagnostic events or MAR entries were found in the last 24 hours in the retrieved records. Confirm timestamps and the source chart before concluding that no clinical events occurred.";
    rows.forEach((e) => sources.push(source(e.label.split(" · ")[0], e.at, e.label)));
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
      notes: patient.notes || "", allergies: patient.allergies || "",
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
