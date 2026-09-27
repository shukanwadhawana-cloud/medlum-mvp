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
 * Matches OPD chart Section density: header bar, 2-col grid, vitals boxes,
 * real orders/notes when present — never invents clinical data.
 */
function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2 bg-[#f8f6fa]">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h3>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-gray-400 py-1">{text}</p>;
}

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
  const rx =
    selected?.prescriptions ||
    selected?.medications ||
    selected?.activeMedications ||
    selected?.prescriptionSummaries ||
    [];
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
  const fmtDate = (d: any) =>
    d
      ? new Date(d).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";

  const complaint =
    selected?.chiefComplaint || selected?.presentingComplaints || null;
  const diagnosis =
    selected?.diagnosis || selected?.workingDiagnosis || null;
  const allergy = selected?.allergies || null;
  const hasVitals =
    vitals?.bp ||
    vitals?.pulse ||
    vitals?.rr ||
    vitals?.spo2 ||
    vitals?.temperature ||
    selected?.vitals?.bp ||
    selected?.vitals?.pulse;

  const v = {
    bp: vitals?.bp || selected?.vitals?.bp || "—",
    pulse: vitals?.pulse || selected?.vitals?.pulse || "—",
    rr: vitals?.rr || selected?.vitals?.rr || "—",
    spo2: vitals?.spo2 || selected?.vitals?.spo2 || "—",
    temperature: vitals?.temperature || selected?.vitals?.temperature || "—",
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm">Cover Sheet · Clinical Snapshot</h3>
          <p className="text-[10px] text-gray-500">
            IPD workspace · same snapshot density as OPD patient chart
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Cover sheet · Problems / Chief complaint">
          {complaint ? (
            <p className="text-sm whitespace-pre-wrap text-gray-900">{complaint}</p>
          ) : (
            <Empty text="No active problem recorded for this patient." />
          )}
          {diagnosis && (
            <p className="text-xs text-gray-600 mt-2">
              <b>Diagnosis:</b> {diagnosis}
            </p>
          )}
          {selected?.icdCode && (
            <p className="mt-0.5 text-[10px] text-gray-500">ICD-10: {selected.icdCode}</p>
          )}
        </Section>

        <Section title="Allergies / Notes">
          <p
            className={`text-sm font-medium ${
              allergy ? "text-red-700" : "text-gray-500"
            }`}
          >
            {allergy || "Not recorded"}
          </p>
          {selected?.notes &&
            String(selected.notes).replace(/__MEDLUM_[^:]+:[^\n]*\n?/g, "").trim() && (
              <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap line-clamp-3">
                {String(selected.notes)
                  .replace(/(?:^|\n)__MEDLUM_[^:]+:[^\n]*\n?/g, "")
                  .trim()
                  .slice(0, 200)}
              </p>
            )}
        </Section>

        <Section
          title="Active lab orders"
          action={
            <button
              type="button"
              onClick={() => onOpenOrders("Laboratory")}
              className="text-[11px] text-[#c2183a] font-medium"
            >
              Open labs
            </button>
          }
        >
          {!labOrders?.length ? (
            <Empty text="No active lab orders." />
          ) : (
            <ul className="space-y-1.5">
              {labOrders.slice(0, 8).map((o: any) => (
                <li
                  key={o.id || o.testName || o.name}
                  className="flex justify-between gap-2 text-xs"
                >
                  <span className="font-medium text-gray-900">
                    {o.testName || o.name || o.investigation || "Lab order"}
                  </span>
                  <span className="text-gray-500 shrink-0">
                    {o.status ? String(o.status) + " · " : ""}
                    {fmt(o.orderedAt || o.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Imaging / Diagnostics"
          action={
            <button
              type="button"
              onClick={() => onOpenOrders("Radiology")}
              className="text-[11px] text-[#c2183a] font-medium"
            >
              Order imaging
            </button>
          }
        >
          {!radOrders?.length ? (
            <Empty text="No diagnostic orders." />
          ) : (
            <ul className="space-y-1.5">
              {radOrders.slice(0, 8).map((o: any) => (
                <li
                  key={o.id || o.name || o.study}
                  className="flex justify-between gap-2 text-xs"
                >
                  <span className="font-medium text-gray-900">
                    {o.name || o.study || o.studyName || o.testName || "Imaging"}
                    {o.modality ? ` (${o.modality})` : ""}
                  </span>
                  <span className="text-gray-500 shrink-0">
                    {o.status ? String(o.status) + " · " : ""}
                    {fmt(o.orderedAt || o.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Active prescriptions"
          action={
            <button
              type="button"
              onClick={() => onOpenOrders("Order Medicines")}
              className="text-[11px] text-[#c2183a] font-medium"
            >
              All Rx
            </button>
          }
        >
          {!rx?.length ? (
            <Empty text="No active prescriptions." />
          ) : (
            <ul className="space-y-1.5">
              {rx.slice(0, 6).map((r: any, i: number) => (
                <li
                  key={r.id || i}
                  className="flex justify-between gap-2 text-xs border-b border-gray-50 pb-1 last:border-0"
                >
                  <span className="font-medium text-gray-900">
                    {typeof r === "string"
                      ? r
                      : r.medicines || r.name || r.drug || r.medication || "Rx"}
                  </span>
                  <span className="text-gray-500 shrink-0">
                    {fmt(r.createdAt || r.orderedAt || r.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Latest vitals"
          action={
            <button
              type="button"
              onClick={onOpenVitals}
              className="text-[11px] text-[#c2183a] font-medium"
            >
              Update
            </button>
          }
        >
          {!hasVitals ? (
            <Empty text="No vitals captured yet." />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["B/P", v.bp],
                  ["Pulse", v.pulse],
                  ["Temp", v.temperature],
                  ["SpO₂", v.spo2],
                  ["RR", v.rr],
                ] as const
              ).map(([k, val]) => (
                <div
                  key={k}
                  className="rounded-lg border bg-slate-50/80 px-2 py-1.5 text-center"
                >
                  <p className="text-[10px] text-gray-500">{k}</p>
                  <p className="text-sm font-semibold text-gray-900">{val}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Recent clinical notes"
          action={
            <button
              type="button"
              onClick={onOpenNotes}
              className="text-[11px] text-[#c2183a] font-medium"
            >
              All notes
            </button>
          }
        >
          {!clinicalNotes?.length ? (
            <Empty text="No clinical notes yet." />
          ) : (
            <ul className="space-y-1.5">
              {clinicalNotes.slice(0, 5).map((n: any) => (
                <li key={n.id} className="text-xs border-b last:border-0 pb-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">
                      {n.noteType || n.title || "Note"}
                    </span>
                    <span className="text-gray-500 shrink-0">
                      {fmt(n.createdAt)}
                    </span>
                  </div>
                  {n.content && (
                    <p className="text-gray-600 truncate mt-0.5">
                      {String(n.content).slice(0, 120)}
                      {String(n.content).length > 120 ? "…" : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Admission details">
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-1.5 pr-2 font-semibold">Admitted</th>
                  <th className="pb-1.5 pr-2 font-semibold">Status</th>
                  <th className="pb-1.5 pr-2 font-semibold">Ward</th>
                  <th className="pb-1.5 pr-2 font-semibold">Bed</th>
                  <th className="pb-1.5 font-semibold">Consultant</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100">
                  <td className="py-1.5 pr-2">{fmtDate(selected?.admissionDate)}</td>
                  <td className="py-1.5 pr-2">
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                      {selected?.status || "IPD"}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">{selected?.wardType || "—"}</td>
                  <td className="py-1.5 pr-2">{selected?.roomNumber || "—"}</td>
                  <td className="py-1.5">
                    {selected?.consultantName || "—"}
                    {selected?.department ? (
                      <span className="block text-[10px] text-gray-400">
                        {selected.department}
                      </span>
                    ) : null}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
