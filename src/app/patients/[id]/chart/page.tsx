"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiGetPatientDetail } from "@/lib/api";
import { formatIst } from "@/lib/time";
import { ClinicalVitalsPanel } from "@/components/ClinicalVitalsPanel";
import { ClinicalNotesPanel } from "@/components/ClinicalNotesPanel";
import { ClinicalOrdersPanel } from "@/components/ClinicalOrdersPanel";
import { ClinicalRxPanel } from "@/components/ClinicalRxPanel";
import { ClinicalProblemsPanel } from "@/components/ClinicalProblemsPanel";
import MedicationAdministrationPanel from "@/components/ipd/MedicationAdministrationPanel";
import { ClinicalIOPanel } from "@/components/ClinicalIOPanel";
import { ClinicalDischargePanel } from "@/components/ClinicalDischargePanel";
import { ClinicalReferralPanel } from "@/components/ClinicalReferralPanel";
import { ClinicalReportsPanel } from "@/components/ClinicalReportsPanel";

type TimelineItem = { date: string; kind: "Consult" | "Lab" | "Dx" | "Rx" | "Appt" | "Billing"; title: string; detail?: string; sort: number };

type TabId = "overview" | "problems" | "notes" | "orders" | "lab" | "radiology" | "rx" | "vitals" | "io" | "discharge" | "referral" | "report" | "billing";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Cover sheet" },
  { id: "problems", label: "Problems" },
  { id: "notes", label: "Clinical notes" },
  { id: "orders", label: "Orders" },
  { id: "lab", label: "Lab" },
  { id: "radiology", label: "Radiology" },
  { id: "rx", label: "Medications" },
  { id: "vitals", label: "Vitals" },
  { id: "io", label: "Intake / Output" },
  { id: "discharge", label: "Discharge summary" },
  { id: "referral", label: "Referral" },
  { id: "report", label: "Report" },
  { id: "billing", label: "Billing" },
];

const LAB_ACTIVE = new Set([
  "Ordered", "Sample Pending", "Sample Collected", "Processing",
  "Result Available", "Awaiting Review", "PENDING", "ACTIVE",
]);

function parseProfile(notes?: string): Record<string, string> {
  if (!notes) return {};
  const m = String(notes).match(/(?:^|\n)__MEDLUM_PROFILE__:(\{[^\n]*\})\n?/);
  if (!m) return {};
  try { return JSON.parse(m[1]) as Record<string, string>; } catch { return {}; }
}

function parseCareSetting(notes?: string): "OPD" | "IPD" {
  const m = String(notes || "").match(/(?:^|\n)__MEDLUM_CARE_SETTING__:(OPD|IPD)\n?/);
  return m?.[1] === "IPD" ? "IPD" : "OPD";
}

function cleanNotes(notes?: string): string {
  return String(notes || "")
    .replace(/(?:^|\n)__MEDLUM_CARE_SETTING__:(OPD|IPD)\n?/g, "")
    .replace(/(?:^|\n)__MEDLUM_PROFILE__:\{[^\n]*\}\n?/g, "")
    .trim();
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2 bg-[#f8f6fa]">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h3>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-gray-400 py-2">{text}</p>;
}

export default function PatientClinicalChartPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("overview");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      setData(await apiGetPatientDetail(id));
    } catch (e: any) {
      setData(null);
      setError(e?.message || "Could not load clinical chart");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) { router.replace("/login"); return; }
    load();
  }, [doctor, authLoading, router, load]);

  const p = data?.patient;
  const profile = useMemo(() => parseProfile(p?.notes), [p?.notes]);
  const careSetting = useMemo(() => parseCareSetting(p?.notes), [p?.notes]);
  const freeNotes = useMemo(() => cleanNotes(p?.notes), [p?.notes]);

  const encounters = data?.encounters || [];
  const labs = data?.labOrders || [];
  const diagnostics = data?.diagnosticOrders || [];
  const prescriptions = data?.prescriptions || [];
  const invoices = data?.invoices || [];
  const appointments = data?.appointments || [];

  const clinicalTimeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    encounters.forEach((e: any) => items.push({ date: e.date || formatIst(e.createdAt, { dateOnly: true }), kind: "Consult", title: e.diagnosis || e.chiefComplaint || "Consultation", detail: e.clinicalNotes, sort: new Date(e.createdAt).getTime() }));
    labs.forEach((l: any) => items.push({ date: formatIst(l.orderedAt, { dateOnly: true }), kind: "Lab", title: l.testName, detail: l.result || l.status, sort: new Date(l.orderedAt).getTime() }));
    diagnostics.forEach((d: any) => items.push({ date: formatIst(d.orderedAt || d.createdAt, { dateOnly: true }), kind: "Dx", title: d.studyName, detail: d.impression || d.status, sort: new Date(d.orderedAt || d.createdAt).getTime() }));
    prescriptions.forEach((r: any) => items.push({ date: formatIst(r.createdAt, { dateOnly: true }), kind: "Rx", title: "Prescription", detail: r.medicines, sort: new Date(r.createdAt).getTime() }));
    appointments.forEach((a: any) => items.push({ date: a.date, kind: "Appt", title: `${a.type} · ${a.time}`, detail: a.status, sort: new Date(a.createdAt).getTime() }));
    invoices.forEach((i: any) => items.push({ date: formatIst(i.createdAt, { dateOnly: true }), kind: "Billing", title: `₹${i.amount}`, detail: i.note || "Fee", sort: new Date(i.createdAt).getTime() }));
    return items.sort((a, b) => b.sort - a.sort);
  }, [encounters, labs, diagnostics, prescriptions, appointments, invoices]);

  const activeLabs = labs.filter((l: any) => LAB_ACTIVE.has(String(l.status || "")));
  const latestEncounter = encounters[0];
  const latestVitals = encounters.find(
    (e: any) => e.bp || e.pulse || e.temperature || e.spo2 || e.weight || e.height
  );

  if (authLoading || loading) {
    return <AppShell><div className="p-6 text-sm text-gray-500">Loading clinical chart…</div></AppShell>;
  }
  if (error || !p) {
    return (
      <AppShell>
        <div className="p-6 space-y-3">
          <p className="text-sm text-red-600">{error || "Patient not found."}</p>
          <Link href="/patients" className="text-xs text-[#c2183a] font-medium">Back to patients</Link>
        </div>
      </AppShell>
    );
  }

  const clinicLabel = doctor?.clinicName || "MedLum Clinic";
  const wardLine = [profile.wardType, profile.unitType, profile.roomNumber].filter(Boolean).join(" · ");

  return (
    <AppShell>
      <div className="space-y-3">
        <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
          <div className="grid gap-0 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
            <div className="p-3 bg-emerald-50/60">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/70">Patient</p>
              <p className="text-base font-semibold text-[#140a1f] leading-tight">{p.name}</p>
              <p className="text-xs text-gray-600 mt-0.5">{p.gender} · {p.age} yrs{p.phone ? ` · ${p.phone}` : ""}</p>
              <p className="text-[11px] text-gray-500 mt-1">
                {p.uhid ? `UHID ${p.uhid}` : ""}{p.uhid && p.registrationNo ? " · " : ""}
                {p.registrationNo ? `Reg ${p.registrationNo}` : ""}
                {!p.uhid && !p.registrationNo ? "No UHID / registration" : ""}
              </p>
            </div>
            <div className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Visit / {careSetting}</p>
              <p className="text-sm font-medium text-[#140a1f]">
                {careSetting === "IPD" ? wardLine || "IPD — room/bed not set" : "Outpatient"}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {profile.consultantName ? `Consultant: ${profile.consultantName}` : clinicLabel}
                {profile.consultantSpecialty ? ` · ${profile.consultantSpecialty}` : ""}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Registered {formatIst(p.createdAt, { dateOnly: true })}
                {profile.mlcNumber ? ` · MLC ${profile.mlcNumber}` : ""}
              </p>
            </div>
            <div className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Clinical alerts</p>
              <p className="text-sm">
                <span className="text-gray-500 text-xs">Allergies: </span>
                <span className={p.allergies && String(p.allergies).toLowerCase() !== "none" ? "font-semibold text-red-700" : "text-gray-700"}>
                  {p.allergies || "Not recorded"}
                </span>
              </p>
              <p className="text-xs text-gray-600 mt-1">
                <span className="text-gray-500">Working Dx: </span>
                {profile.workingDiagnosis || profile.diagnosis || latestEncounter?.diagnosis || "—"}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                {data?.role ? `Your role: ${data.role}` : ""}
                {data?.access?.clinical === false ? " · Limited clinical access" : ""}
              </p>
            </div>
          </div>

        </div>

        <div className="grid gap-3 lg:grid-cols-[13rem_minmax(0,1fr)] items-start">
          <aside className="rounded-xl border bg-white p-2 lg:sticky lg:top-3">
            <div className="px-2 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Quick actions</p>
              <p className="mt-0.5 text-[11px] text-gray-400">Actions create or update the chart. The chart itself stays in the main panel.</p>
            </div>
            <div className="space-y-1">
              <Link href={`/patients/${id}`} className="flex min-h-9 items-center rounded-lg bg-[#c2183a] px-2.5 text-xs font-semibold text-white">New consult</Link>
              <button type="button" onClick={() => setTab("orders")} className="flex min-h-9 w-full items-center rounded-lg border px-2.5 text-left text-xs font-medium">Order labs / imaging</button>
              <button type="button" onClick={() => setTab("rx")} className="flex min-h-9 w-full items-center rounded-lg border px-2.5 text-left text-xs font-medium">Prescribe</button>
              <button type="button" onClick={() => setTab("notes")} className="flex min-h-9 w-full items-center rounded-lg border px-2.5 text-left text-xs font-medium">Add note</button>
              <Link href="/labs" className="flex min-h-9 items-center rounded-lg border px-2.5 text-xs font-medium">Labs queue</Link>
              <Link href="/prescriptions" className="flex min-h-9 items-center rounded-lg border px-2.5 text-xs font-medium">Prescriptions</Link>
              {careSetting === "IPD" && (
                <Link href="/ipd-summaries" className="flex min-h-9 items-center rounded-lg border px-2.5 text-xs font-medium">IPD summaries</Link>
              )}
              <Link href="/ipd" className="flex min-h-9 items-center rounded-lg border px-2.5 text-xs font-medium">IPD board</Link>
              <Link href={`/patients/${id}`} className="flex min-h-9 items-center rounded-lg border bg-[#f8f6fa] px-2.5 text-xs font-medium">Full record</Link>
            </div>

            <div className="mt-3 border-t pt-3">
              <div className="px-2 py-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Clinical timeline</p>
                <p className="mt-0.5 text-[10px] text-gray-400">One compact view of the patient's activity.</p>
              </div>
              <div className="mt-1 max-h-[42vh] overflow-y-auto pr-1">
                {clinicalTimeline.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-gray-400">No clinical activity yet.</p>
                ) : (
                  <div className="space-y-1">
                    {clinicalTimeline.map((item, index) => {
                      const target: TabId = item.kind === "Consult" ? "notes" : item.kind === "Lab" ? "lab" : item.kind === "Dx" ? "radiology" : item.kind === "Rx" ? "rx" : item.kind === "Billing" ? "billing" : "overview";
                      return (
                        <button
                          key={`${item.kind}-${item.sort}-${index}`}
                          type="button"
                          onClick={() => setTab(target)}
                          className="group w-full rounded-lg border border-transparent px-2 py-1.5 text-left hover:border-gray-200 hover:bg-gray-50"
                          title={item.detail || item.title}
                        >
                          <div className="flex items-start gap-1.5">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c2183a]" />
                            <span className="min-w-0">
                              <span className="block truncate text-[11px] font-medium text-gray-700">{item.title}</span>
                              <span className="block text-[9px] text-gray-400">{item.kind} · {item.date}</span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>

          <main className="min-w-0">
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="inline-flex min-w-full gap-1 rounded-xl border bg-white p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition ${
                      tab === t.id ? "bg-[#140a1f] text-white" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

        {tab === "overview" && (
          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="Cover sheet · problems / chief complaint">
              {latestEncounter?.chiefComplaint || profile.chiefComplaint ? (
                <p className="text-sm whitespace-pre-wrap">{latestEncounter?.chiefComplaint || profile.chiefComplaint}</p>
              ) : (
                <Empty text="No active problem recorded for this patient." />
              )}
              {(latestEncounter?.diagnosis || profile.diagnosis) && (
                <p className="text-xs text-gray-600 mt-2"><b>Diagnosis:</b> {latestEncounter?.diagnosis || profile.diagnosis}</p>
              )}
            </Section>
            <Section title="Allergies / notes">
              <p className="text-sm">{p.allergies || "Not recorded"}</p>
              {freeNotes ? <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">{freeNotes}</p> : null}
            </Section>
            <Section title="Active lab orders" action={<Link href="/labs" className="text-[11px] text-[#c2183a] font-medium">Open queue</Link>}>
              {activeLabs.length === 0 ? <Empty text="No active lab orders." /> : (
                <ul className="space-y-1.5">
                  {activeLabs.slice(0, 8).map((l: any) => (
                    <li key={l.id} className="flex justify-between gap-2 text-xs">
                      <span className="font-medium">{l.testName}</span>
                      <span className="text-gray-500 shrink-0">{l.status} · {formatIst(l.orderedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Imaging / diagnostics">
              {diagnostics.length === 0 ? <Empty text="No diagnostic orders." /> : (
                <ul className="space-y-1.5">
                  {diagnostics.slice(0, 8).map((d: any) => (
                    <li key={d.id} className="flex justify-between gap-2 text-xs">
                      <span className="font-medium">{d.studyName}{d.modality ? ` (${d.modality})` : ""}</span>
                      <span className="text-gray-500 shrink-0">{d.status} · {formatIst(d.orderedAt || d.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Active prescriptions" action={<Link href="/prescriptions" className="text-[11px] text-[#c2183a] font-medium">All Rx</Link>}>
              {prescriptions.length === 0 ? <Empty text="No prescriptions." /> : (
                <ul className="space-y-2">
                  {prescriptions.slice(0, 5).map((r: any) => (
                    <li key={r.id} className="text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">Rx</span>
                        <span className="text-gray-500">{formatIst(r.createdAt)}</span>
                      </div>
                      <p className="text-gray-700 whitespace-pre-wrap mt-0.5">{r.medicines}</p>
                      <Link href={`/prescriptions/print?id=${encodeURIComponent(r.id)}`} className="text-[#c2183a] font-medium">Print</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Latest vitals (from encounters)">
              {!latestVitals ? <Empty text="No vitals captured on encounters yet." /> : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[["B/P", latestVitals.bp], ["Pulse", latestVitals.pulse], ["Temp", latestVitals.temperature], ["SpO₂", latestVitals.spo2], ["Weight", latestVitals.weight], ["Height", latestVitals.height]].map(([k, v]) => (
                    <div key={k as string} className="rounded-lg border px-2 py-1.5">
                      <p className="text-[10px] text-gray-500">{k}</p>
                      <p className="font-medium">{(v as string) || "—"}</p>
                    </div>
                  ))}
                  <p className="col-span-full text-[11px] text-gray-500">From encounter {formatIst(latestVitals.createdAt)}</p>
                </div>
              )}
            </Section>
            <Section title="Recent encounters">
              {encounters.length === 0 ? <Empty text="No encounters yet." /> : (
                <ul className="space-y-1.5">
                  {encounters.slice(0, 6).map((e: any) => (
                    <li key={e.id} className="text-xs border-b last:border-0 pb-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{e.date || formatIst(e.createdAt, { dateOnly: true })}</span>
                        <span className="text-gray-500">{formatIst(e.createdAt)}</span>
                      </div>
                      <p className="text-gray-600 truncate">{e.chiefComplaint || e.diagnosis || "Encounter"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Appointments">
              {appointments.length === 0 ? <Empty text="No appointments." /> : (
                <ul className="space-y-1 text-xs">
                  {appointments.slice(0, 6).map((a: any) => (
                    <li key={a.id} className="flex justify-between gap-2">
                      <span>{a.date} {a.time} · {a.type}</span>
                      <span className="text-gray-500">{a.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}

        {tab === "problems" && (
          <ClinicalProblemsPanel
            patientId={String(id)}
            encounters={encounters}
            profile={profile}
            onSaved={async () => { await load(); }}
          />
        )}

        {tab === "notes" && (
          <ClinicalNotesPanel
            patientId={String(id)}
            encounters={encounters}
            labs={labs}
            diagnostics={diagnostics}
            prescriptions={prescriptions}
            profile={profile}
            onSaved={async () => { await load(); }}
          />
        )}

        {tab === "orders" && (
          <ClinicalOrdersPanel
            patientId={String(id)}
            labs={labs}
            diagnostics={diagnostics}
            onSaved={async () => { await load(); }}
          />
        )}

        {tab === "lab" && (
          <ClinicalOrdersPanel
            patientId={String(id)}
            labs={labs}
            diagnostics={diagnostics}
            focus="lab"
            onSaved={async () => { await load(); }}
          />
        )}

        {tab === "radiology" && (
          <ClinicalOrdersPanel
            patientId={String(id)}
            labs={labs}
            diagnostics={diagnostics}
            focus="radiology"
            onSaved={async () => { await load(); }}
          />
        )}

        {tab === "rx" && (
          <div className="space-y-3">
            <ClinicalRxPanel
              patientId={String(id)}
              prescriptions={prescriptions}
              onSaved={async () => { await load(); }}
            />
            {careSetting === "IPD" ? (
              <section className="overflow-hidden rounded-xl border bg-white">
                <div className="border-b bg-[#f8f6fa] px-3 py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Medication administration record (IPD)
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Schedule and record given / held / refused doses for this inpatient. Authorised clinical roles only.
                  </p>
                </div>
                <div className="p-3">
                  <MedicationAdministrationPanel patient={p} />
                </div>
              </section>
            ) : (
              <p className="text-[11px] text-gray-400 px-1">
                Inpatient MAR is available when this patient is on the IPD census (care setting IPD).
              </p>
            )}
          </div>
        )}

        {tab === "vitals" && (
          <ClinicalVitalsPanel
            patientId={String(id)}
            encounters={encounters}
            onSaved={async () => { await load(); }}
          />
        )}

        {tab === "io" && (
          <ClinicalIOPanel
            patientId={String(id)}
            encounters={encounters}
            onSaved={async () => { await load(); }}
          />
        )}

        {tab === "discharge" && (
          <ClinicalDischargePanel
            patientId={String(id)}
            patient={p}
            encounters={encounters}
            labs={labs}
            prescriptions={prescriptions}
            profile={profile}
            careSetting={careSetting}
            onSaved={async () => { await load(); }}
          />
        )}

        {tab === "referral" && (
          <ClinicalReferralPanel
            patientId={String(id)}
            encounters={encounters}
            labs={labs}
            diagnostics={diagnostics}
            profile={profile}
            onSaved={async () => { await load(); }}
          />
        )}

        {tab === "report" && (
          <ClinicalReportsPanel
            patientId={String(id)}
            patient={p}
            encounters={encounters}
            labs={labs}
            diagnostics={diagnostics}
            prescriptions={prescriptions}
            careSetting={careSetting}
          />
        )}

        {tab === "billing" && (
          <Section title="Billing" action={<Link href="/billing" className="text-[11px] text-[#c2183a] font-medium">Billing desk</Link>}>
            {data?.access?.billing === "none" ? (
              <Empty text="Your role cannot view billing for this patient." />
            ) : invoices.length === 0 ? (
              <Empty text="No invoices." />
            ) : (
              <ul className="divide-y text-xs">
                {invoices.map((i: any) => (
                  <li key={i.id} className="py-2 flex justify-between gap-2">
                    <div>
                      <p className="font-medium">₹{i.amount}</p>
                      {i.note && <p className="text-gray-500">{i.note}</p>}
                    </div>
                    <div className="text-right">
                      <p>{i.status}</p>
                      <p className="text-gray-500">{formatIst(i.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
          </main>
        </div>
      </div>
    </AppShell>
  );
}
