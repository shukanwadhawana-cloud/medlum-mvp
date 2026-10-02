"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { formatIst } from "@/lib/time";
import { letterheadStyle, showMedlumFooter } from "@/lib/print-layout";

/** Clinical sections after Diagnosis — hospital discharge order. */
const BODY_SECTIONS = [
  "Presenting Complaints",
  "History of Present Illness",
  "Past Medical History",
  "Current Medication",
  "Personal History",
  "Family History",
  "Allergies",
  "Occupational History",
  "On Examination",
  "Course In Hospital",
  "Procedure",
  "Procedures",
  "Surgery",
  "Findings",
  "Condition on Discharge",
  "Investigation",
  "Investigations",
  "Medications During Stay",
  "Advice",
  "Special Needs",
  "Follow Up Advice",
] as const;

const PARSE_LABELS = [
  "Date and Time of Discharge",
  "Diagnosis",
  ...BODY_SECTIONS,
  "Acknowledgement of receipt",
  "Addendum",
] as const;

type SectionMap = Record<string, string>;

function parseSections(raw: string): SectionMap {
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return {};
  const map: SectionMap = {};
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (!current) return;
    const v = buf.join("\n").trim();
    if (v) map[current] = v;
    buf = [];
  };
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (
      /^(self-?pay|insurance|esic|cash|tpa|administrative)/i.test(trimmed) ||
      trimmed.startsWith("Self-pay") ||
      trimmed.startsWith("Insurance")
    ) {
      continue;
    }
    if (trimmed === "— Pulled sections —" || trimmed === "-- Pulled sections --") {
      flush();
      current = null;
      buf = [];
      continue;
    }
    if (
      /^(Medication Orders|Laboratory|Radiology|Previous Clinical Notes|Chart Orders|Vitals):/i.test(
        trimmed
      )
    ) {
      continue;
    }
    let matched = false;
    for (const label of PARSE_LABELS) {
      const prefix = label + ":";
      if (trimmed.startsWith(prefix) || trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        flush();
        current = label;
        buf = [trimmed.slice(trimmed.indexOf(":") + 1).trim()];
        matched = true;
        break;
      }
    }
    if (!matched && current) buf.push(line);
  }
  flush();
  return map;
}

function formatDischargeWhen(raw: string): string {
  const s = String(raw || "").trim();
  if (!s || s === "—") return "—";
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    try {
      return formatIst(s);
    } catch {
      return s.replace("T", " ");
    }
  }
  return s;
}

export default function IPDDischargePrintPage() {
  const params = useParams<{ id: string }>();
  const patientId = String(params?.id || "");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!patientId) return;
    fetch(`/api/ipd/print?patientId=${encodeURIComponent(patientId)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.printable) throw new Error(d.error || "Could not load discharge summary");
        setData(d.printable);
      })
      .catch((e) => setError(e.message || "Could not load discharge summary"));
  }, [patientId]);

  const sections = useMemo(() => parseSections(data?.summary?.content || ""), [data]);

  if (error) {
    return <main className="p-8 text-sm font-semibold text-red-700">{error}</main>;
  }
  if (!data) {
    return <main className="p-8 text-sm text-slate-500">Loading discharge summary…</main>;
  }

  const patient = data.summary?.patient || {};
  const hospital = data.hospital || {};
  const summary = data.summary || {};
  const author = summary.author || {};
  const admission = summary.admission || {};

  const ageGender = [patient.age != null ? `${patient.age} yrs` : null, patient.gender]
    .filter(Boolean)
    .join(" · ");
  const uhid = patient.uhid || patient.registrationNo || "—";
  const dischargeWhen = formatDischargeWhen(
    sections["Date and Time of Discharge"] ||
      (summary.authoredAt ? formatIst(summary.authoredAt) : "—")
  );
  const diagnosis = sections["Diagnosis"] || "—";
  const address = admission.address || patient.address || null;
  const doa =
    admission.admissionDate
      ? formatIst(admission.admissionDate)
      : admission.doa || null;

  const demoItems: { label: string; value?: string | null }[] = [
    { label: "Patient name", value: patient.name },
    { label: "Patient ID / UHID", value: uhid },
    {
      label: "IP / Encounter",
      value: admission.ipNo || (patient.id ? String(patient.id).slice(-6).toUpperCase() : null),
    },
    { label: "Age / Gender", value: ageGender },
    { label: "Mobile", value: patient.phone },
    { label: "Date of admission", value: doa },
    { label: "Ward / Bed", value: admission.ward || admission.wardType },
    { label: "Address", value: address },
    { label: "Primary consultant", value: author.name || admission.consultant },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 print:bg-white">
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div>
          <p className="text-sm font-semibold tracking-tight">Discharge summary</p>
          <p className="text-[11px] text-slate-500">
            {patient.name || "Patient"} · UHID {uhid}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="h-9 rounded-full bg-[#c2183a] px-5 text-xs font-semibold text-white shadow-sm hover:bg-[#a01430]"
        >
          Print / Save PDF
        </button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-6 py-8 shadow-sm print:max-w-none print:px-5 print:py-4 print:shadow-none">
        <div className="w-full" style={letterheadStyle(hospital)} aria-hidden />

        <header className="mb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {hospital.name || "Hospital"}
          </p>
          {hospital.address && (
            <p className="mt-0.5 text-[11px] text-slate-500">{hospital.address}</p>
          )}
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            Discharge Summary
          </h1>
          <div className="mx-auto mt-2 h-0.5 w-16 rounded-full bg-[#c2183a]" />
        </header>

        {/* 1. Date & time of discharge */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Date and time of discharge
            </p>
            <p className="mt-0.5 text-base font-semibold text-slate-900">{dischargeWhen}</p>
          </div>
          {hospital.phone && (
            <p className="text-[11px] text-slate-500">Facility · {hospital.phone}</p>
          )}
        </div>

        {/* 2. Patient details */}
        <section className="mb-5 overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Patient details
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-3">
            {demoItems.map(
              (item) =>
                item.value && (
                  <div key={item.label} className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-[13px] font-medium leading-snug text-slate-900">
                      {item.value}
                    </p>
                  </div>
                )
            )}
          </div>
        </section>

        {/* 3. Diagnosis */}
        <section className="mb-5 overflow-hidden rounded-xl border border-slate-800">
          <div className="bg-slate-900 px-4 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white">
              Diagnosis
            </h2>
          </div>
          <div className="px-4 py-3 text-[15px] font-semibold leading-snug text-slate-900 whitespace-pre-wrap">
            {diagnosis}
          </div>
        </section>

        {/* 4. Clinical body */}
        <div className="space-y-3">
          {BODY_SECTIONS.map((key) => {
            const body = sections[key];
            if (!body?.trim()) return null;
            return (
              <section
                key={key}
                className="break-inside-avoid overflow-hidden rounded-lg border border-slate-200"
              >
                <div className="border-b border-slate-100 bg-slate-50/80 px-3.5 py-1.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                    {key}
                  </h3>
                </div>
                <div className="px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {body}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-10 grid grid-cols-2 gap-10 break-inside-avoid">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Patient / attendant
            </p>
            <div className="mt-14 border-b border-slate-400" />
            <p className="mt-1 text-[10px] text-slate-400">Signature</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Treating consultant
            </p>
            <p className="mt-3 text-[15px] font-semibold text-slate-900">{author.name || "—"}</p>
            <p className="text-[11px] text-slate-500">
              {[author.designation, author.staffCode].filter(Boolean).join(" · ")}
            </p>
            {summary.authoredAt && (
              <p className="mt-1 text-[10px] text-slate-400">
                Signed {formatIst(summary.authoredAt)}
              </p>
            )}
          </div>
        </div>

        <footer className="mt-8 border-t border-slate-100 pt-3 text-center text-[9px] leading-relaxed text-slate-400">
          <p>
            Computer-generated clinical record. Does not replace verbal counselling.
            {hospital.phone ? ` Emergency contact: ${hospital.phone}.` : ""}
          </p>
          {showMedlumFooter(hospital) && <p className="mt-1">MedLum</p>}
        </footer>
      </article>
    </main>
  );
}
