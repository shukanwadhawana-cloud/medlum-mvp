"use client";

type Props = {
  selected: any;
  vitals: { bp?: string; pulse?: string; rr?: string; spo2?: string; temperature?: string };
  labOrders: any[];
  radOrders: any[];
  clinicalNotes: any[];
  onOpenOrders: (left: string) => void;
  onOpenNotes: () => void;
  onOpenVitals: () => void;
};

/**
 * OPD-parity clinical snapshot for the IPD workspace Cover Sheet tab.
 * Displays real orders/vitals/notes when present; never invents clinical data.
 */
export default function IpdCoverSheet({
  selected,
  vitals,
  labOrders,
  radOrders,
  clinicalNotes,
  onOpenOrders,
  onOpenNotes,
  onOpenVitals,
}: Props) {
  const rx = selected?.prescriptions || selected?.medications || selected?.activeMedications || [];
  const fmt = (d: any) =>
    d
      ? new Date(d).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-sm">Cover Sheet · Clinical Snapshot</h3>
        <p className="text-[10px] text-gray-400">IPD workspace · same snapshot density as OPD patient chart</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Cover sheet · Problems / Chief complaint
          </p>
          <p className="mt-1.5 text-sm text-gray-900 whitespace-pre-wrap">
            {selected.chiefComplaint || selected.presentingComplaints || "Not recorded"}
          </p>
          <p className="mt-2 text-xs">
            <span className="font-semibold text-gray-600">Diagnosis:</span>{" "}
            {selected.diagnosis || selected.workingDiagnosis || "Not recorded"}
          </p>
          {selected.icdCode && (
            <p className="mt-0.5 text-[10px] text-gray-500">ICD-10: {selected.icdCode}</p>
          )}
        </div>
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Allergies / Notes</p>
          <p className={`mt-1.5 text-sm font-medium ${selected.allergies ? "text-red-700" : "text-gray-500"}`}>
            {selected.allergies || "No Known Allergies"}
          </p>
          {selected.notes && (
            <p className="mt-2 text-xs text-gray-600 whitespace-pre-wrap">{selected.notes}</p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Active lab orders</p>
            <button type="button" onClick={() => onOpenOrders("Laboratory")} className="text-[10px] font-semibold text-[#c2183a]">
              Open queue
            </button>
          </div>
          {!labOrders.length ? (
            <p className="mt-2 text-xs text-gray-500">No active lab orders.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {labOrders.slice(0, 8).map((o: any) => (
                <li
                  key={o.id || o.testName || o.name}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-50 pb-1 last:border-0"
                >
                  <span className="text-xs font-medium text-gray-900">
                    {o.testName || o.name || o.investigation || "Lab order"}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {o.status ? String(o.status) + " · " : ""}
                    {fmt(o.orderedAt || o.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Imaging / Diagnostics</p>
            <button type="button" onClick={() => onOpenOrders("Radiology")} className="text-[10px] font-semibold text-[#c2183a]">
              Order imaging
            </button>
          </div>
          {!radOrders.length ? (
            <p className="mt-2 text-xs text-gray-500">No imaging orders.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {radOrders.slice(0, 8).map((o: any) => (
                <li
                  key={o.id || o.name || o.study}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-50 pb-1 last:border-0"
                >
                  <span className="text-xs font-medium text-gray-900">
                    {o.name || o.study || o.testName || "Imaging"}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {o.status ? String(o.status) + " · " : ""}
                    {fmt(o.orderedAt || o.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Active prescriptions</p>
            <button
              type="button"
              onClick={() => onOpenOrders("Order Medicines")}
              className="text-[10px] font-semibold text-[#c2183a]"
            >
              All Rx
            </button>
          </div>
          {!rx.length ? (
            <p className="mt-2 text-xs text-gray-500">No active prescriptions. Use Orders → Order Medicines or MAR.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {rx.slice(0, 6).map((r: any, i: number) => (
                <li
                  key={r.id || i}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-50 pb-1 last:border-0"
                >
                  <span className="text-xs font-medium text-gray-900 whitespace-pre-wrap">
                    {r.medicines || r.name || r.medication || "Prescription"}
                  </span>
                  <span className="text-[10px] text-gray-400">{fmt(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Latest vitals</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                ["B/P", selected.vitals?.bp || vitals.bp || "—"],
                ["Pulse", selected.vitals?.pulse || vitals.pulse || "—"],
                ["Temp", selected.vitals?.temperature || vitals.temperature || "—"],
                ["SpO₂", selected.vitals?.spo2 || vitals.spo2 || "—"],
                ["RR", selected.vitals?.rr || vitals.rr || "—"],
                ["Weight", selected.vitals?.weight || selected.weight || "—"],
              ] as [string, string][]
            ).map(([label, val]) => (
              <div key={label} className="rounded-lg border bg-slate-50/80 px-2 py-2 text-center">
                <p className="text-[9px] font-semibold uppercase text-gray-400">{label}</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">{val}</p>
              </div>
            ))}
          </div>
          <button type="button" onClick={onOpenVitals} className="mt-2 text-[10px] font-semibold text-[#c2183a]">
            Update vitals →
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full min-w-[520px] text-left text-[11px]">
          <thead className="bg-slate-50 text-gray-500">
            <tr>
              <th className="p-2.5 font-semibold">Admission</th>
              <th className="p-2.5 font-semibold">Status</th>
              <th className="p-2.5 font-semibold">Ward</th>
              <th className="p-2.5 font-semibold">Bed</th>
              <th className="p-2.5 font-semibold">Consultant</th>
              <th className="p-2.5 font-semibold">Department</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="p-2.5">
                {selected.admissionDate
                  ? new Date(selected.admissionDate).toLocaleString("en-IN")
                  : "—"}
              </td>
              <td className="p-2.5">
                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                  {selected.status || "IPD"}
                </span>
              </td>
              <td className="p-2.5">{selected.wardType || "—"}</td>
              <td className="p-2.5">{selected.roomNumber || "—"}</td>
              <td className="p-2.5">{selected.consultantName || "—"}</td>
              <td className="p-2.5">{selected.department || "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Recent clinical notes</p>
          <button type="button" onClick={onOpenNotes} className="text-[10px] font-semibold text-[#c2183a]">
            All notes
          </button>
        </div>
        {!clinicalNotes.length ? (
          <p className="mt-2 text-xs text-gray-500">No clinical notes yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {clinicalNotes.slice(0, 5).map((n: any) => (
              <li key={n.id} className="border-b border-gray-50 pb-2 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-gray-900">{n.noteType || n.title || "Note"}</span>
                  <span className="text-[10px] text-gray-400">{fmt(n.createdAt)}</span>
                </div>
                {n.content && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-600">
                    {String(n.content).slice(0, 160)}
                    {String(n.content).length > 160 ? "…" : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
