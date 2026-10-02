"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatIst } from "@/lib/time";
import { letterheadStyle, showMedlumFooter } from "@/lib/print-layout";

const SECTION_ORDER = [
  "Date and Time of Discharge",
  "Diagnosis",
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

type SectionMap = Record<string, string>;

function parseSections(raw: string): SectionMap {
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return {};
  const map: SectionMap = {};
  const labels = SECTION_ORDER.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const labelRe = new RegExp(`^(${labels.join("|")}):(.*)$`, "i");
  const lines = text.split("\n");
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (!current) return;
    const v = buf.join("\n").trim();
    if (v) map[current] = v;
    buf = [];
  };
  for (const line of lines) {
    const m = line.match(labelRe);
    if (m) {
      flush();
      current = SECTION_ORDER.find((s) => s.toLowerCase() === m[1].toLowerCase()) || m[1];
      buf = [m[2].trim()];
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  if (!Object.keys(map).length && text) map["Diagnosis"] = text;
  return map;
}

function DemoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <p className="text-sm font-medium leading-snug text-[#140a1f]">{value}</p>
    </div>
  );
}

function ClinicalBox({ title, body }: { title: string; body: string }) {
  if (!body?.trim()) return null;
  return (
    <section className="mt-3 break-inside-avoid">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#140a1f]">{title}</h3>
      <div className="rounded border border-gray-300 bg-white px-2.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">
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
        <p className="text-red-600">{err}</p>
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

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-6 text-[#140a1f] print:max-w-none print:p-4">
      <div className="mb-4 flex items-start justify-between gap-3 print:hidden">
        <Link href="/ipd" className="text-sm text-[#c2183a]">
          ← IPD
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-[#c2183a] px-3 py-2 text-sm font-semibold text-white"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="w-full print:block" style={letterheadStyle(h)} aria-hidden />

      <header className="border-b border-gray-300 pb-3 print:hidden">
        <h1 className="text-lg font-bold tracking-tight">{h.name || "Hospital"}</h1>
        {h.address && <p className="text-xs text-gray-600">{h.address}</p>}
        <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-gray-500">
          {h.phone && <span>Tel: {h.phone}</span>}
          {h.registrationNo && <span>Reg: {h.registrationNo}</span>}
          {h.email && <span>{h.email}</span>}
        </div>
      </header>

      <h2 className="mt-3 text-center text-base font-bold uppercase tracking-wide">Discharge Summary</h2>

      <section className="mt-4 border border-gray-400">
        <div className="border-b border-gray-300 bg-gray-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide">
          Patient Demography Details
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-2.5 sm:grid-cols-3">
          <DemoRow label="Name" value={patient.name} />
          <DemoRow label="Patient ID / UHID" value={uhid} />
          <DemoRow
            label="IP / Encounter"
            value={profile.ipNo || (patient.id ? String(patient.id).slice(-6).toUpperCase() : undefined)}
          />
          <DemoRow label="Age / Gender" value={ageGender || undefined} />
          <DemoRow label="Mobile No." value={patient.phone} />
          <DemoRow label="Primary Consultant" value={author.name || profile.consultant} />
          <DemoRow
            label="Date of Admission"
            value={profile.admissionDate ? formatIst(profile.admissionDate) : profile.doa}
          />
          <DemoRow label="Ward / Bed" value={profile.ward || profile.wardType} />
          <DemoRow label="Address" value={profile.address} />
        </div>
        <div className="border-t border-gray-300 px-2.5 py-1.5 text-sm">
          <span className="text-[10px] font-semibold uppercase text-gray-500">Date and Time of Discharge · </span>
          <span className="font-medium">{dischargeWhen}</span>
        </div>
      </section>

      {SECTION_ORDER.filter((k) => k !== "Date and Time of Discharge").map((key) => (
        <ClinicalBox key={key} title={key} body={sections[key] || ""} />
      ))}

      <div className="mt-8 grid grid-cols-2 gap-6 break-inside-avoid text-sm">
        <div>
          <p className="text-[10px] uppercase text-gray-500">Patient / Attendant</p>
          <div className="mt-8 border-b border-gray-400" />
          <p className="mt-1 text-[10px] text-gray-500">Signature</p>
        </div>
        <div className="text-right">
          <p className="font-semibold">{author.name || "Consultant"}</p>
          <p className="text-xs text-gray-600">
            {[author.designation, author.staffCode].filter(Boolean).join(" · ") || "Treating Consultant"}
          </p>
          {s.authoredAt && (
            <p className="mt-1 text-[10px] text-gray-500">Signed: {formatIst(s.authoredAt)}</p>
          )}
        </div>
      </div>

      <footer className="mt-8 border-t border-gray-200 pt-3 text-[9px] leading-relaxed text-gray-500">
        <p>
          This is a computer-generated clinical document. It does not replace verbal counselling. In case of
          emergency, contact the treating facility.
        </p>
        {h.phone && <p className="mt-0.5">Facility contact: {h.phone}</p>}
        {showMedlumFooter(h) && (
          <p className="mt-2 text-center tracking-wide text-gray-400">Document system: MedLum</p>
        )}
      </footer>
    </div>
  );
}

export default function IpdPrintPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <PrintInner />
    </Suspense>
  );
}
