"use client";

import Link from "next/link";
import { formatIst } from "@/lib/time";

export function ClinicalReportsPanel({
  patientId,
  patient,
  encounters,
  labs,
  diagnostics,
  prescriptions,
  careSetting,
}: {
  patientId: string;
  patient: any;
  encounters: any[];
  labs: any[];
  diagnostics: any[];
  prescriptions: any[];
  careSetting: "OPD" | "IPD";
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Clinical print / reports
          </h3>
        </div>
        <div className="space-y-2 p-3 text-sm">
          <p className="text-xs text-gray-500">
            Open existing clinical print routes for this patient. Authored documents use session identity.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/prescriptions"
              className="h-9 rounded-lg border px-3 text-xs font-medium inline-flex items-center"
            >
              Prescriptions desk
            </Link>
            <Link
              href="/labs"
              className="h-9 rounded-lg border px-3 text-xs font-medium inline-flex items-center"
            >
              Labs queue
            </Link>
            <Link
              href="/ipd-summaries"
              className="h-9 rounded-lg border px-3 text-xs font-medium inline-flex items-center"
            >
              IPD summaries
            </Link>
            {careSetting === "IPD" && (
              <Link
                href="/ipd/print"
                className="h-9 rounded-lg bg-[#140a1f] px-3 text-xs font-medium text-white inline-flex items-center"
              >
                IPD clinical print
              </Link>
            )}
            <Link
              href={`/patients/${patientId}`}
              className="h-9 rounded-lg border px-3 text-xs font-medium inline-flex items-center"
            >
              Full patient record
            </Link>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Chart snapshot counts
          </h3>
        </div>
        <ul className="divide-y text-xs p-3">
          <li className="flex justify-between py-2">
            <span>Patient</span>
            <span className="font-medium">{patient?.name || "—"}</span>
          </li>
          <li className="flex justify-between py-2">
            <span>Encounters / notes</span>
            <span className="font-medium">{encounters.length}</span>
          </li>
          <li className="flex justify-between py-2">
            <span>Lab orders</span>
            <span className="font-medium">{labs.length}</span>
          </li>
          <li className="flex justify-between py-2">
            <span>Imaging / diagnostics</span>
            <span className="font-medium">{diagnostics.length}</span>
          </li>
          <li className="flex justify-between py-2">
            <span>Prescriptions</span>
            <span className="font-medium">{prescriptions.length}</span>
          </li>
        </ul>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white lg:col-span-2">
        <div className="border-b bg-[#f8f6fa] px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Recent documents (from chart data)
          </h3>
        </div>
        <div className="grid gap-3 p-3 md:grid-cols-3">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Labs</p>
            {labs.length === 0 ? (
              <p className="text-xs text-gray-400">None</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {labs.slice(0, 6).map((l: any) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span className="truncate font-medium">{l.testName}</span>
                    <span className="shrink-0 text-gray-500">{l.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Imaging</p>
            {diagnostics.length === 0 ? (
              <p className="text-xs text-gray-400">None</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {diagnostics.slice(0, 6).map((d: any) => (
                  <li key={d.id} className="flex justify-between gap-2">
                    <span className="truncate font-medium">{d.studyName}</span>
                    <span className="shrink-0 text-gray-500">{d.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">Rx</p>
            {prescriptions.length === 0 ? (
              <p className="text-xs text-gray-400">None</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {prescriptions.slice(0, 6).map((r: any) => (
                  <li key={r.id}>
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">Prescription</span>
                      <span className="text-gray-500">{formatIst(r.createdAt)}</span>
                    </div>
                    <p className="truncate text-gray-600">{r.medicines}</p>
                    <Link
                      href={`/prescriptions/print?id=${encodeURIComponent(r.id)}`}
                      className="text-[#c2183a] font-medium"
                    >
                      Print
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
