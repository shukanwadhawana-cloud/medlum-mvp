"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatIst } from "@/lib/time";
import { letterheadStyle, showMedlumFooter } from "@/lib/print-layout";

/**
 * Clinical body order after Diagnosis (Diagnosis is rendered first, always at top).
 */
const BODY_SECTIONS = [
  "Presenting Complaints",
  "History of Present Illness",
  "Past Medical History",
  "Personal History",
  "Family History",
  "Allergies",
  "Occupational History",
  "Course In Hospital",
  "Surgery",
  "Procedures",
  "Investigations",
  "Condition on Discharge",
  "Medications During Stay",
  "Advice",
  "Special Needs",
  "Follow Up Advice",
  "Acknowledgement of receipt",
  "Addendum",
] as const;

const ALL_LABELS = ["Date and Time of Discharge", "Diagnosis", ...BODY_SECTIONS] as const;

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
    let matched = false;
    for (const label of ALL_LABELS) {
      const prefix = label + ":";
      if (line.startsWith(prefix) || line.toLowerCase().startsWith(prefix.toLowerCase())) {
        flush();
        current = label;
        buf = [line.slice(line.indexOf(":") + 1).trim()];
        matched = true;
        break;
      }
    }
    if (!matched && current) buf.push(line);
    else if (!matched && !current) {
      if (!map["__body"]) map["__body"] = line;
      else map["__body"] += "\n" + line;
    }
  }
  flush();
  if (!Object.keys(map).filter((k) => k !== "__body").length && text) {
    map["Diagnosis"] = text;
    delete map["__body"];
  }
  return map;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0 border-b border-gray-200 pb-1 last:border-0">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-black">{label}</div>
      <div className="text-[13px] font-medium leading-snug text-[#140a1f]">{value}</div>
    </div>
  );
}

function Section({ title, body, emphasize }: { title: string; body: string; emphasize?: boolean }) {
  if (!body?.trim()) return null;
  return (
    <section className={`mt-4 break-inside-avoid ${emphasize ? "border-2 border-black" : "border border-gray-400"}`}>
      <div
        className={`px-2.5 py-1.5 text-[12px] font-extrabold uppercase tracking-wide ${
          emphasize ? "bg-black text-white" : "border-b border-gray-400 bg-gray-100 text-black"
        }`}
      >
        {title}
      </div>
      <div className="px-2.5 py-2 text-[13px] font-medium leading-relaxed whitespace-pre-wrap text-[#140a1f]">
        {body}
      </div>
    </section>
  );
}

function PrintInner() {
  const sp = useSearchParams();
  const patientId = sp.get("patientId") || "";
  const noteId = sp.get("noteId") || "";
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!patientId) {
      setErr("Missing patientId");
      return;
    }
    (async () => {
      try {
        const q = new URLSearchParams({ patientId });
        if (noteId) q.set("noteId", noteId);
        const res = await fetch(`/api/ipd/print?${q.toString()}`, { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json.printable) {
          setErr(json.error || "Could not load discharge summary");
          return;
        }
        setData(json.printable);
      } catch {
        setErr("Network error");
      }
    })();
  }, [patientId, noteId]);

  const sections = useMemo(() => parseSections(data?.summary?.content || ""), [data]);

  if (err) {
    return (
      <div className="p-6">
        <p className="text-red-600 font-semibold">{err}</p>
        <Link href="/ipd" className="text-sm text-[#c2183a]">
          ← IPD
        </Link>
      </div>
    );
  }
  if (!data) return <p className="p-6 text-sm text-gray-500">Loading discharge summary…</p>;

  const h = data.hospital || {};
  const s = data.summary || {};
  const patient = s.patient || {};
  const author = s.author || {};
  const profile = s.admission || {};

  const ageGender = [patient.age != null ? `${patient.age} Years` : null, patient.gender]
    .filter(Boolean)
    .join(" / ");
  const uhid = patient.uhid || patient.registrationNo || "—";
  const dischargeWhen =
    sections["Date and Time of Discharge"] ||
    (s.authoredAt ? formatIst(s.authoredAt) : "—");
  const diagnosis = sections["Diagnosis"] || "";

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-5 text-black print:max-w-none print:p-3">
      <div className="mb-4 flex items-start justify-between gap-3 print:hidden">
        <Link href="/ipd" className="text-sm font-semibold text-[#c2183a]">
          ← IPD
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-[#c2183a] px-3 py-2 text-sm font-bold text-white"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="w-full" style={letterheadStyle(h)} aria-hidden />

      <header className="border-b-2 border-black pb-2 print:hidden">
        <h1 className="text-xl font-extrabold tracking-tight">{h.name || "Hospital"}</h1>
        {h.address && <p className="text-xs font-medium text-gray-700">{h.address}</p>}
        <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] font-semibold text-gray-600">
          {h.phone && <span>Tel: {h.phone}</span>}
          {h.registrationNo && <span>Reg: {h.registrationNo}</span>}
        </div>
      </header>

      <h2 className="mt-3 text-center text-lg font-extrabold uppercase tracking-wider underline decoration-2">
        Discharge Summary
      </h2>

      {/* 1) DIAGNOSIS — always first, bold, prominent */}
      <section className="mt-4 border-2 border-black break-inside-avoid">
        <div className="bg-black px-2.5 py-1.5 text-[13px] font-extrabold uppercase tracking-wide text-white">
          Diagnosis
        </div>
        <div className="px-2.5 py-2.5 text-[14px] font-bold leading-snug whitespace-pre-wrap">
          {diagnosis || "—"}
        </div>
      </section>

      {/* 2) Patient demography */}
      <section className="mt-4 border-2 border-black break-inside-avoid">
        <div className="border-b-2 border-black bg-gray-100 px-2.5 py-1.5 text-[12px] font-extrabold uppercase tracking-wide">
          Patient Demography Details
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-2 p-2.5 sm:grid-cols-3">
          <Field label="Name" value={patient.name} />
          <Field label="Patient ID / UHID" value={uhid} />
          <Field
            label="IP / Encounter"
            value={profile.ipNo || (patient.id ? String(patient.id).slice(-6).toUpperCase() : undefined)}
          />
          <Field label="Age / Gender" value={ageGender || undefined} />
          <Field label="Mobile No." value={patient.phone} />
          <Field label="Primary Consultant" value={author.name || profile.consultant} />
          <Field
            label="Date of Admission"
            value={profile.admissionDate ? formatIst(profile.admissionDate) : profile.doa}
          />
          <Field label="Ward / Bed" value={profile.ward || profile.wardType} />
          <Field label="Address" value={profile.address} />
        </div>
        <div className="border-t-2 border-black px-2.5 py-2">
          <span className="text-[11px] font-extrabold uppercase">Date and Time of Discharge: </span>
          <span className="text-[13px] font-bold">{dischargeWhen}</span>
        </div>
      </section>

      {/* 3) Remaining clinical sections — bold bar headers */}
      {BODY_SECTIONS.map((key) => (
        <Section key={key} title={key} body={sections[key] || ""} />
      ))}

      {sections["__body"] && <Section title="Clinical Notes" body={sections["__body"]} />}

      <div className="mt-10 grid grid-cols-2 gap-8 break-inside-avoid text-sm">
        <div>
          <p className="text-[11px] font-extrabold uppercase">Patient / Attendant</p>
          <div className="mt-10 border-b-2 border-black" />
          <p className="mt-1 text-[10px] font-semibold text-gray-600">Signature</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-extrabold uppercase">Treating Consultant</p>
          <p className="mt-2 text-[14px] font-extrabold">{author.name || "—"}</p>
          <p className="text-xs font-semibold text-gray-700">
            {[author.designation, author.staffCode].filter(Boolean).join(" · ")}
          </p>
          {s.authoredAt && (
            <p className="mt-1 text-[10px] font-semibold text-gray-600">Signed: {formatIst(s.authoredAt)}</p>
          )}
        </div>
      </div>

      <footer className="mt-8 border-t border-gray-300 pt-2 text-[9px] font-medium leading-relaxed text-gray-600">
        <p>
          This is a computer-generated clinical document and does not replace verbal counselling. In emergency,
          contact the treating facility{h.phone ? ` (${h.phone})` : ""}.
        </p>
        {showMedlumFooter(h) && (
          <p className="mt-1 text-center text-gray-400">Document system: MedLum</p>
        )}
      </footer>
    </div>
  );
}

export default function IpdPrintPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm font-semibold">Loading…</p>}>
      <PrintInner />
    </Suspense>
  );
}
