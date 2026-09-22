"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatIst } from "@/lib/time";
import { letterheadStyle, showMedlumFooter } from "@/lib/print-layout";

function PrintInner() {
  const sp = useSearchParams();
  const id = sp.get("id") || "";
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!id) {
      setErr("Missing prescription id");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/prescriptions/print?id=${encodeURIComponent(id)}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.printable) {
          setErr(json.error || "Could not load prescription");
          return;
        }
        setData(json.printable);
      } catch {
        setErr("Network error");
      }
    })();
  }, [id]);

  if (err) {
    return (
      <div className="p-6">
        <p className="text-red-600">{err}</p>
        <Link href="/prescriptions" className="text-sm text-[#c2183a]">
          ← Prescriptions
        </Link>
      </div>
    );
  }
  if (!data) return <p className="p-6 text-sm text-gray-500">Loading prescription…</p>;

  const h = data.hospital || {};
  const rx = data.prescription || {};
  const author = rx.author || {};
  const patient = rx.patient || {};

  return (
    <div className="mx-auto max-w-lg bg-white p-6 text-[#140a1f] print:p-4">
      <div className="mb-4 flex items-start justify-between gap-3 print:hidden">
        <Link href="/prescriptions" className="text-sm text-[#c2183a]">
          ← Prescriptions
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
        Prescription
      </p>

      <div className="mt-3 flex justify-between text-sm">
        <div>
          <p className="font-semibold">{rx.patientName || patient.name}</p>
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
          <p>{rx.createdAt ? formatIst(rx.createdAt) : ""}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase text-gray-500">Medicines</p>
        <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{rx.medicines}</pre>
      </div>

      {rx.advice && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase text-gray-500">Advice</p>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{rx.advice}</pre>
        </div>
      )}

      <div className="mt-8 text-sm">
        <p className="font-medium">{author.name}</p>
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

export default function PrescriptionPrintPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <PrintInner />
    </Suspense>
  );
}
