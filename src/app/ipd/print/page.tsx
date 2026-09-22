"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatIst } from "@/lib/time";
import { letterheadStyle, showMedlumFooter } from "@/lib/print-layout";

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

  return (
    <div className="mx-auto max-w-2xl bg-white p-6 text-[#140a1f] print:p-4">
      <div className="mb-4 flex items-start justify-between gap-3 print:hidden">
        <Link href="/ipd" className="text-sm text-[#c2183a]">
          ← IPD
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-[#c2183a] px-3 py-2 text-sm font-semibold text-white"
        >
          Print
        </button>
      </div>

      <div className="w-full" style={letterheadStyle(h)} aria-hidden />

      <header className="border-b pb-3 print:hidden">
        <h1 className="text-lg font-bold">{h.name || "Hospital"}</h1>
        {h.address && <p className="text-xs text-gray-600">{h.address}</p>}
      </header>

      <p className="mt-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
        {s.noteType || "Discharge Summary"}
      </p>

      <div className="mt-3 flex justify-between text-sm">
        <div>
          <p className="font-semibold">{patient.name}</p>
          {patient.uhid && <p className="text-xs text-gray-500">UHID {patient.uhid}</p>}
          {patient.registrationNo && (
            <p className="text-xs text-gray-500">Reg {patient.registrationNo}</p>
          )}
          {(patient.age != null || patient.gender) && (
            <p className="text-xs text-gray-500">
              {[patient.age != null ? `${patient.age}y` : null, patient.gender].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>{s.authoredAt ? formatIst(s.authoredAt) : ""}</p>
        </div>
      </div>

      <div className="mt-4">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{s.content}</pre>
      </div>

      <div className="mt-10 text-sm">
        <p className="font-medium">{author.name || "Consultant"}</p>
        <p className="text-xs text-gray-500">
          {[author.staffCode, author.designation].filter(Boolean).join(" · ")}
        </p>
      </div>

      {showMedlumFooter(h) && (
        <p className="mt-6 text-center text-[9px] tracking-wide text-gray-400">Powered by MedLum</p>
      )}
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
