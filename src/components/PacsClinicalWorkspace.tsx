"use client";

import { useEffect, useMemo, useState } from "react";
import ImagingStudiesPanel from "@/components/ImagingStudiesPanel";
import { formatIst } from "@/lib/time";

type DiagnosticOrder = {
  id: string;
  patientId: string;
  patientName: string;
  studyName: string;
  modality: string;
  bodyPart: string;
  indication: string;
  status: string;
  findings: string;
  impression: string;
  notes: string;
  orderedAt: string;
  performedAt?: string | null;
  reportedAt?: string | null;
  encounterId?: string | null;
};

export default function PacsClinicalWorkspace({ orders }: { orders: DiagnosticOrder[] }) {
  const [selectedId, setSelectedId] = useState(orders[0]?.id || "");

  useEffect(() => {
    if (orders.length === 0) {
      setSelectedId("");
      return;
    }
    if (!orders.some((order) => order.id === selectedId)) setSelectedId(orders[0].id);
  }, [orders, selectedId]);

  const selected = useMemo(
    () => orders.find((order) => order.id === selectedId) || null,
    [orders, selectedId]
  );

  const statusTone =
    selected?.status === "Reported"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : selected?.status === "Performed"
        ? "border-blue-200 bg-blue-50 text-blue-800"
        : selected?.status === "Cancelled"
          ? "border-slate-200 bg-slate-100 text-slate-600"
          : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="clinical-imaging-title">
      <header className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Radiology · PACS</p>
              <h2 id="clinical-imaging-title" className="text-base font-semibold text-slate-950">Imaging workbench</h2>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600">
            Orders, reports, and linked studies from this clinic. Only verified DICOM studies can open in the configured PACS viewer.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-600 sm:self-center">
          <span className="h-2 w-2 rounded-full bg-slate-400" />
          Live clinical records
        </div>
      </header>

      {orders.length > 0 ? (
        <>
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)]">
            <div className="min-w-0 border-b border-slate-200 bg-slate-950 p-3 sm:p-4 lg:border-b-0 lg:border-r lg:border-slate-800">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-slate-200">
                <div>
                  <p className="text-xs font-semibold text-white">Image viewport</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">DICOM pixels are shown only by the authorized PACS viewer</p>
                </div>
                <span className="rounded border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300">Clinical view</span>
              </div>

              <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-slate-800 bg-[#070b12] px-5 py-8 text-center sm:min-h-[360px]">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-400" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.35">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-white">
                  {selected ? "No verified image series in this viewport" : "Select a diagnostic order"}
                </h3>
                <p className="mt-2 max-w-md text-xs leading-5 text-slate-400">
                  {selected
                    ? "This order is linked to the clinical record below. When a DICOM study is available and verified, open it from Linked imaging studies to launch the real PACS viewer. No illustrative or fabricated scan is shown here."
                    : "Choose an existing order to review its patient, study details, report, and linked imaging records."}
                </p>
                {selected ? (
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <span className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-200">{selected.modality || "Modality not specified"}</span>
                    {selected.bodyPart ? <span className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-200">{selected.bodyPart}</span> : null}
                    <span className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-200">Order {selected.id.slice(0, 8)}</span>
                  </div>
                ) : null}
              </div>
              <p className="mt-2 text-[10px] leading-4 text-slate-500">
                This panel does not synthesize medical images. Diagnostic interpretation must use the actual verified study in the configured viewer.
              </p>
            </div>

            <aside className="min-w-0 p-4 sm:p-5">
              <label htmlFor="clinical-imaging-order" className="mb-1.5 block text-xs font-semibold text-slate-700">Diagnostic order</label>
              <select
                id="clinical-imaging-order"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              >
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.patientName} · {order.studyName}
                  </option>
                ))}
              </select>

              {selected ? (
                <div className="mt-4 space-y-4">
                  <div className="border-b border-slate-200 pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Patient</p>
                        <p className="mt-1 break-words text-sm font-semibold text-slate-950">{selected.patientName}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${statusTone}`}>{selected.status}</span>
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-700">{selected.studyName}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {[selected.modality, selected.bodyPart, selected.orderedAt ? formatIst(selected.orderedAt) : ""].filter(Boolean).join(" · ")}
                    </p>
                  </div>

                  <ClinicalField title="Clinical indication" value={selected.indication} empty="No indication recorded." />
                  <ClinicalField title="Findings" value={selected.findings} empty="Report findings have not been entered." />
                  <ClinicalField title="Impression" value={selected.impression} empty="No impression recorded." emphasis />
                  {selected.notes ? <ClinicalField title="Notes" value={selected.notes} /> : null}
                  {selected.reportedAt ? (
                    <p className="text-[10px] text-slate-500">Reported {formatIst(selected.reportedAt)}</p>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </div>

          {selected ? (
            <div className="border-t border-slate-200 px-3 py-3 sm:px-5 sm:py-4">
              <ImagingStudiesPanel patientId={selected.patientId} diagnosticOrderId={selected.id} />
            </div>
          ) : null}
        </>
      ) : (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-semibold text-slate-900">No diagnostic orders available</p>
          <p className="mt-1 text-xs text-slate-500">Create a diagnostic order above to populate this workspace from real clinic records.</p>
        </div>
      )}
    </section>
  );
}

function ClinicalField({
  title,
  value,
  empty = "Not recorded.",
  emphasis = false,
}: {
  title: string;
  value?: string | null;
  empty?: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
      <p className={`mt-1 whitespace-pre-wrap break-words text-xs leading-5 ${value ? emphasis ? "font-medium text-slate-900" : "text-slate-700" : "italic text-slate-400"}`}>
        {value?.trim() || empty}
      </p>
    </div>
  );
}
