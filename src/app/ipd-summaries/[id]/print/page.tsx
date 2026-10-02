"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { formatIst } from "@/lib/time";
import { letterheadStyle, showMedlumFooter } from "@/lib/print-layout";

/**
 * Labels that appear in discharge note content (from IPD chart / discharge worksheet).
 * Diagnosis is always rendered first; the rest follow in this order.
 */
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
  "Acknowledgement of receipt",
  "Addendum",
] as const;

const ALL_LABELS = [
  "Date and Time of Discharge",
  "Diagnosis",
  ...BODY_SECTIONS,
  "Patient/Attendant acknowledgement recorded.",
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
    if (!current && !trimmed.includes(":") && trimmed.length > 0 && !map["__admin"]) {
      map["__admin"] = trimmed;
      continue;
    }
    if (trimmed === "— Pulled sections —" || trimmed === "-- Pulled sections --") {
      flush();
      current = "Pulled sections";
      buf = [];
      continue;
    }
    let matched = false;
    for (const label of ALL_LABELS) {
      const prefix = label + ":";
      if (
        trimmed.startsWith(prefix) ||
        trimmed.toLowerCase().startsWith(prefix.toLowerCase())
      ) {
        flush();
        current = label;
        buf = [trimmed.slice(trimmed.indexOf(":") + 1).trim()];
        matched = true;
        break;
      }
    }
    if (!matched && current) buf.push(line);
    else if (!matched && trimmed) {
      if (!map["__extra"]) map["__extra"] = trimmed;
      else map["__extra"] += "\n" + trimmed;
    }
  }
  flush();
  return map;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-black">{label}</div>
      <div className="text-[13px] font-semibold leading-snug text-black">{value}</div>
    </div>
  );
}

function Section({
  title,
  body,
  variant = "default",
}: {
  title: string;
  body: string;
  variant?: "default" | "diagnosis";
}) {
  if (!body?.trim()) return null;
  const isDx = variant === "diagnosis";
  return (
    <section className={`mt-3 break-inside-avoid border-2 ${isDx ? "border-black" : "border-gray-500"}`}>
      <div
        className={`px-2.5 py-1.5 text-[12px] font-extrabold uppercase tracking-wide ${
          isDx ? "bg-black text-white" : "border-b-2 border-gray-500 bg-gray-100 text-black"
        }`}
      >
        {title}
      </div>
      <div
        className={`px-2.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-black ${
          isDx ? "font-bold text-[14px]" : "font-medium"
        }`}
      >
        {body}
      </div>
    </section>
  );
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

  if (error) return <main className="p-8 text-sm font-semibold text-red-700">{error}</main>;
  if (!data) return <main className="p-8 text-sm font-semibold">Loading discharge summary…</main>;

  const patient = data.summary?.patient || {};
  const hospital = data.hospital || {};
  const summary = data.summary || {};
  const author = summary.author || {};
  const admission = summary.admission || {};

  const ageGender = [patient.age != null ? `${patient.age}` : null, patient.gender]
    .filter(Boolean)
    .join(" / ");
  const uhid = patient.uhid || patient.registrationNo || "—";
  const dischargeWhen =
    sections["Date and Time of Discharge"] ||
    (summary.authoredAt ? formatIst(summary.authoredAt) : "—");
  const diagnosis = sections["Diagnosis"] || "—";
  const address = admission.address || patient.address || null;

  const bodyKeys = [
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
    "Pulled sections",
  ];

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b bg-white p-3">
        <div>
          <p className="text-sm font-extrabold">Final Discharge Summary</p>
          <p className="text-[11px] font-semibold text-gray-600">
            UHID {uhid} · {patient.name || "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="h-9 rounded-lg bg-[#c2183a] px-4 text-xs font-bold text-white"
        >
          Print / Save PDF
        </button>
      </div>

      <article className="mx-auto max-w-[210mm] p-6 print:p-4">
        <div className="w-full" style={letterheadStyle(hospital)} aria-hidden />

        <header className="border-b-2 border-black pb-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-700">
            {hospital.name || "Hospital"}
          </p>
          {hospital.address && (
            <p className="text-[11px] font-medium text-gray-600">{hospital.address}</p>
          )}
          <h1 className="mt-1 text-center text-xl font-extrabold uppercase tracking-wider underline decoration-2">
            Discharge Summary
          </h1>
        </header>

        <Section title="Diagnosis" body={diagnosis} variant="diagnosis" />

        <section className="mt-3 border-2 border-black break-inside-avoid">
          <div className="border-b-2 border-black bg-gray-100 px-2.5 py-1.5 text-[12px] font-extrabold uppercase tracking-wide">
            Patient Demography Details
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 p-2.5 sm:grid-cols-3">
            <Field label="Name" value={patient.name} />
            <Field label="Patient ID / UHID" value={uhid} />
            <Field
              label="IP / Encounter"
              value={
                admission.ipNo ||
                (patient.id ? String(patient.id).slice(-6).toUpperCase() : undefined)
              }
            />
            <Field label="Age / Gender" value={ageGender || undefined} />
            <Field label="Mobile No." value={patient.phone} />
            <Field label="Primary Consultant" value={author.name || admission.consultant} />
            <Field
              label="Date of Admission"
              value={
                admission.admissionDate
                  ? formatIst(admission.admissionDate)
                  : admission.doa || undefined
              }
            />
            <Field label="Ward / Bed" value={admission.ward || admission.wardType} />
            <Field label="Address" value={address} />
          </div>
          {sections["__admin"] && (
            <div className="border-t border-gray-400 px-2.5 py-1.5 text-[12px] font-semibold">
              <span className="font-extrabold uppercase">Administrative pathway: </span>
              {sections["__admin"]}
            </div>
          )}
          <div className="border-t-2 border-black px-2.5 py-2">
            <span className="text-[11px] font-extrabold uppercase">Date and Time of Discharge: </span>
            <span className="text-[13px] font-bold">{dischargeWhen}</span>
          </div>
        </section>

        {bodyKeys.map((key) => (
          <Section key={key} title={key} body={sections[key] || ""} />
        ))}

        {sections["__extra"] && <Section title="Additional Notes" body={sections["__extra"]} />}

        <div className="mt-10 grid grid-cols-2 gap-8 break-inside-avoid">
          <div>
            <p className="text-[11px] font-extrabold uppercase">Patient / Attendant</p>
            <div className="mt-12 border-b-2 border-black" />
            <p className="mt-1 text-[10px] font-bold text-gray-600">Signature</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-extrabold uppercase">Treating Consultant</p>
            <p className="mt-2 text-[14px] font-extrabold">{author.name || "—"}</p>
            <p className="text-xs font-semibold text-gray-700">
              {[author.designation, author.staffCode].filter(Boolean).join(" · ")}
            </p>
            {summary.authoredAt && (
              <p className="mt-1 text-[10px] font-bold text-gray-600">
                Signed: {formatIst(summary.authoredAt)}
              </p>
            )}
          </div>
        </div>

        <footer className="mt-8 border-t border-gray-300 pt-2 text-[9px] font-medium text-gray-600">
          <p>
            This is a computer-generated clinical document and forms part of the permanent patient record. In
            emergency, contact the treating facility
            {hospital.phone ? ` (${hospital.phone})` : ""}.
          </p>
          {showMedlumFooter(hospital) && (
            <p className="mt-1 text-center text-gray-400">Document system: MedLum</p>
          )}
        </footer>
      </article>
    </main>
  );
}
