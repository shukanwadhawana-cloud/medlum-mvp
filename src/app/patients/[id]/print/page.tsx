"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatIst } from "@/lib/time";
import { letterheadStyle, showMedlumFooter } from "@/lib/print-layout";

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return formatIst(iso);
  } catch {
    return iso;
  }
}

function Section({
  title,
  children,
  breakBefore,
}: {
  title: string;
  children: React.ReactNode;
  breakBefore?: boolean;
}) {
  return (

    <section
      className={`mt-5 border-t border-gray-200 pt-3 ${breakBefore ? "print:break-before-page" : ""}`}
      style={{ breakInside: "avoid" }}
    >
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <p className="text-sm leading-snug">
      <span className="text-gray-500">{label}: </span>
      <span className="whitespace-pre-wrap">{String(value)}</span>
    </p>
  );
}

export default function OpdPatientPrintPage() {
  const params = useParams<{ id: string }>();
  const patientId = String(params?.id || "");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    document.title = "OPD Clinical Record";
    if (!patientId) {
      setErr("Missing patient id");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/print`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.printable) {
          setErr(json.error || "Could not load OPD print package");
          return;
        }
        setData(json.printable);
      } catch {
        setErr("Network error");
      }
    })();
  }, [patientId]);

  if (err) {
    return (
      <div className="p-6">
        <p className="text-red-600 text-sm">{err}</p>
        <button type="button" onClick={() => window.history.back()} className="text-sm text-[#c2183a] print:hidden">← Patient</button>
      </div>
    );
  }
  if (!data) return <p className="p-6 text-sm text-gray-500">Loading OPD record…</p>;

  const h = data.hospital || {};
  const p = data.patient || {};
  const encounters: any[] = data.encounters || [];
  const labs: any[] = data.labOrders || [];
  const diags: any[] = data.diagnosticOrders || [];
  const rxs: any[] = data.prescriptions || [];
  const notes: any[] = data.clinicalNotes || [];
  const appts: any[] = data.appointments || [];
  const taxNote = String(data.taxNote || "").trim();

  const latestEncounter = encounters.length ? encounters[encounters.length - 1] : null;
  const vitalsFrom =
    latestEncounter &&
    (latestEncounter.bp ||
      latestEncounter.pulse ||
      latestEncounter.rr ||
      latestEncounter.spo2 ||
      latestEncounter.temperature ||
      latestEncounter.weight ||
      latestEncounter.height)
      ? latestEncounter
      : null;

  return (
    <div className="opd-print-page mx-auto max-w-[850px] bg-white p-6 text-[#140a1f] print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <p className="text-sm font-semibold text-[#140a1f]">OPD Clinical Record</p>
          <p className="mt-1 text-[11px] text-gray-500">OPD clinical paper record · A4</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-[#c2183a] px-4 py-2 text-sm font-semibold text-white"
        >
          Print / Save PDF
        </button>
      </div>

      <article className="print:p-[12mm]">
        <div className="w-full" style={letterheadStyle(h)} aria-hidden />

        <header className="border-b border-gray-300 pb-2 print:hidden">
          <h1 className="text-lg font-bold">{h.name || "Clinic"}</h1>
          {h.address && <p className="text-xs text-gray-600">{h.address}</p>}
          {(h.phone || h.email) && (
            <p className="text-xs text-gray-600">
              {[h.phone, h.email].filter(Boolean).join(" · ")}
            </p>
          )}
        </header>

        <p className="mt-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
          OPD Clinical Record
        </p>

        <section className="mt-3" style={{ breakInside: "avoid" }}>
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            <div>
              <p className="text-base font-semibold">{p.name}</p>
              <p className="text-xs text-gray-600">
                {[p.age != null ? `${p.age} yrs` : null, p.gender, p.phone]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {p.uhid && <p className="text-xs text-gray-600">UHID: {p.uhid}</p>}
              {p.registrationNo && (
                <p className="text-xs text-gray-600">Registration: {p.registrationNo}</p>
              )}
              {p.allergies && (
                <p className="mt-1 text-xs font-medium text-red-700">Allergies: {p.allergies}</p>
              )}
            </div>
            <div className="text-right text-xs text-gray-500">
              {p.createdAt && <p>Registered: {fmtDate(p.createdAt)}</p>}
              <p>Printed: {fmtDate(new Date().toISOString())}</p>
              {h.registrationNo && <p>Clinic reg: {h.registrationNo}</p>}
            </div>
          </div>
        </section>

        {vitalsFrom && (
          <Section title="Vitals (latest recorded in OPD encounter)">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <Field label="BP" value={vitalsFrom.bp} />
              <Field label="Pulse" value={vitalsFrom.pulse} />
              <Field label="RR" value={vitalsFrom.rr} />
              <Field label="SpO₂" value={vitalsFrom.spo2} />
              <Field label="Temp" value={vitalsFrom.temperature} />
              <Field label="Weight" value={vitalsFrom.weight} />
              <Field label="Height" value={vitalsFrom.height} />
            </div>
          </Section>
        )}

        {latestEncounter && (latestEncounter.chiefComplaint || latestEncounter.diagnosis) && (
          <Section title="Presenting complaint / assessment">
            <Field label="Chief complaint" value={latestEncounter.chiefComplaint} />
            <Field label="Diagnosis" value={latestEncounter.diagnosis} />
            <Field label="Assessment" value={latestEncounter.assessment} />
            <Field label="Plan" value={latestEncounter.plan} />
          </Section>
        )}

        <Section title={`Consultations / encounters (${encounters.length})`} breakBefore={encounters.length > 2}>
          {!encounters.length ? (
            <p className="text-sm text-gray-500">No OPD consultations recorded.</p>
          ) : (
            <div className="space-y-4">
              {encounters.map((e, idx) => (
                <div
                  key={e.id}
                  className="rounded border border-gray-200 p-3"
                  style={{ breakInside: "avoid" }}
                >
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">
                      {idx + 1}. {e.date || fmtDate(e.createdAt)}
                    </span>
                    <span className="text-right">
                      {[e.clinician?.name, e.clinician?.role, e.clinician?.staffCode, fmtDate(e.createdAt)].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <Field label="Chief complaint" value={e.chiefComplaint} />
                  <Field label="Clinical notes" value={e.clinicalNotes} />
                  <Field label="Assessment" value={e.assessment} />
                  <Field label="Diagnosis" value={e.diagnosis} />
                  <Field label="Plan" value={e.plan} />
                  <Field label="Follow-up" value={e.followUpDate} />
                  {(e.bp || e.pulse || e.spo2 || e.rr || e.temperature) && (
                    <p className="mt-1 text-xs text-gray-600">
                      Vitals:{" "}
                      {[
                        e.bp && `BP ${e.bp}`,
                        e.pulse && `Pulse ${e.pulse}`,
                        e.rr && `RR ${e.rr}`,
                        e.spo2 && `SpO₂ ${e.spo2}`,
                        e.temperature && `Temp ${e.temperature}`,
                        e.weight && `Wt ${e.weight}`,
                        e.height && `Ht ${e.height}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Laboratory investigations (${labs.length})`}>
          {!labs.length ? (
            <p className="text-sm text-gray-500">No laboratory orders recorded.</p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-1 pr-2">Date</th>
                  <th className="py-1 pr-2">Test</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1">Result</th>
                </tr>
              </thead>
              <tbody>
                {labs.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100 align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{fmtDate(l.orderedAt)}</td>
                    <td className="py-1.5 pr-2">
                      <span className="font-medium">{l.testName}</span>
                      {l.category ? <span className="text-gray-400"> · {l.category}</span> : null}
                      {l.orderedBy?.name ? (
                        <div className="text-[10px] text-gray-400">Ordered by {[l.orderedBy.name, l.orderedBy.role, l.orderedBy.staffCode].filter(Boolean).join(" · ")}</div>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2">{l.status || "Ordered"}</td>
                    <td className="py-1.5 whitespace-pre-wrap">
                      {l.result
                        ? l.result
                        : l.status && String(l.status).toLowerCase().includes("result")
                          ? l.status
                          : "Ordered / Result pending"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={`Diagnostics / imaging (${diags.length})`}>
          {!diags.length ? (
            <p className="text-sm text-gray-500">No diagnostic orders recorded.</p>
          ) : (
            <div className="space-y-3">
              {diags.map((d) => (
                <div key={d.id} className="text-sm" style={{ breakInside: "avoid" }}>
                  <p className="font-medium">
                    {d.studyName}
                    {d.modality ? ` · ${d.modality}` : ""}
                    {d.bodyPart ? ` · ${d.bodyPart}` : ""}
                  </p>
                  <p className="text-xs text-gray-500">
                    {[fmtDate(d.orderedAt), d.status, d.orderedBy?.name && "Dr " + d.orderedBy.name, d.orderedBy?.role, d.orderedBy?.staffCode].filter(Boolean).join(" · ")}
                  </p>
                  <Field label="Indication" value={d.indication} />
                  <Field label="Findings" value={d.findings} />
                  <Field label="Impression" value={d.impression} />
                  {!d.findings && !d.impression && (
                    <p className="text-xs text-gray-500">Report pending</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Prescriptions (${rxs.length})`}>
          {!rxs.length ? (
            <p className="text-sm text-gray-500">No prescriptions recorded.</p>
          ) : (
            <div className="space-y-3">
              {rxs.map((r) => (
                <div key={r.id} style={{ breakInside: "avoid" }}>
                  <p className="text-xs text-gray-500">
                    {[fmtDate(r.createdAt), r.clinician?.name, r.clinician?.role, r.clinician?.staffCode].filter(Boolean).join(" · ")}
                  </p>
                  <pre className="mt-0.5 whitespace-pre-wrap font-sans text-sm">{r.medicines}</pre>
                  {r.advice && (
                    <p className="mt-1 text-xs text-gray-600">
                      <span className="font-medium">Advice: </span>
                      {r.advice}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Clinical notes (${notes.length})`}>
          {!notes.length ? (
            <p className="text-sm text-gray-500">No finalised clinical notes.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((n) => (
                <div key={n.id} className="text-sm" style={{ breakInside: "avoid" }}>
                  <p className="font-medium">
                    {n.noteType}
                    {n.title ? ` — ${n.title}` : ""}
                  </p>
                  <p className="text-xs text-gray-500">
                    {[
                      fmtDate(n.finalizedAt || n.createdAt),
                      n.author?.name,
                      n.author?.role,
                      n.author?.staffCode,
                      n.status,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {n.content}
                  </pre>
                  {n.verifier?.name && (
                    <p className="mt-1 text-[10px] text-gray-500">Verified by {[n.verifier.name, n.verifier.role, n.verifier.staffCode].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Follow-up & appointments (${appts.length})`}>
          {!appts.length ? (
            <p className="text-sm text-gray-500">No appointments recorded.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {appts.map((a) => (
                <li key={a.id}>
                  {[a.date, a.time, a.type, a.status].filter(Boolean).join(" · ")}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {taxNote && (
          <section className="mt-6 border-t border-gray-200 pt-3" style={{ breakInside: "avoid" }}>
            <h2 className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Clinic / tax information</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-gray-500 whitespace-pre-wrap">{taxNote}</p>
          </section>
        )}

        {showMedlumFooter(h) && (
          <p className="mt-8 text-center text-[9px] tracking-wide text-gray-400">
            Powered by MedLum
          </p>
        )}
      </article>
    </div>
  );
}
