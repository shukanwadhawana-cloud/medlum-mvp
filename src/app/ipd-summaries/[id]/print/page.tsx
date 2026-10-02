"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

/**
 * Compatibility route for older saved/bookmarked discharge-print URLs.
 * It intentionally delegates to the same canonical patient/note print API
 * rather than maintaining a second discharge-print data path.
 */
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
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.printable) throw new Error(d.error || "Could not load discharge summary");
        setData(d.printable);
      })
      .catch(e => setError(e.message || "Could not load discharge summary"));
  }, [patientId]);

  if (error) return <main className="p-8 text-sm text-red-700">{error}</main>;
  if (!data) return <main className="p-8 text-sm">Loading discharge summary…</main>;

  const patient = data.summary?.patient || {};
  const hospital = data.hospital || {};
  const summary = data.summary || {};

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="print:hidden sticky top-0 border-b bg-white p-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">Final Discharge Summary</p>
          <p className="text-[11px] text-gray-500">UHID {patient.uhid || patient.registrationNo || "—"} · {patient.name || "—"}</p>
        </div>
        <button onClick={() => window.print()} className="h-9 px-4 rounded-lg bg-[#c2183a] text-white text-xs font-semibold">
          Print / Save PDF
        </button>
      </div>

      <article className="mx-auto max-w-[850px] p-8 print:p-10">
        <header className="border-b pb-4 mb-5">
          <div className="h-10" />
          <p className="text-xs text-gray-500">{hospital.name || "Hospital"}</p>
          <h1 className="text-xl font-bold">DISCHARGE SUMMARY</h1>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
            <div>Patient: <b>{patient.name || "—"}</b></div>
            <div>UHID: <b>{patient.uhid || patient.registrationNo || "—"}</b></div>
            <div>Age / Gender: {patient.age ?? "—"} / {patient.gender || "—"}</div>
            <div>Phone: {patient.phone || "—"}</div>
          </div>
        </header>

        <pre className="whitespace-pre-wrap font-sans text-xs leading-5">{String(summary.content || "")}</pre>

        <footer className="mt-10 border-t pt-4 text-[10px] text-gray-500">
          Finalized discharge record · MedLum · This document is part of the patient's permanent clinical record.
        </footer>
      </article>
    </main>
  );
}
