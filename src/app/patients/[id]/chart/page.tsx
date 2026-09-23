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

type TabId = "overview" | "notes" | "orders" | "rx" | "vitals" | "discharge" | "billing";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "notes", label: "Clinical notes" },
  { id: "orders", label: "Orders" },
  { id: "rx", label: "Medications" },
  { id: "vitals", label: "Vitals" },
  { id: "discharge", label: "Discharge" },
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
          <div className="flex flex-wrap gap-2 border-t px-3 py-2 bg-[#f8f6fa]">
            <Link href={`/patients/${id}`} className="h-8 px-2.5 rounded-lg border bg-white text-[11px] font-medium inline-flex items-center">Full record</Link>
            <Link href={`/patients/${id}`} className="h-8 px-2.5 rounded-lg bg-[#c2183a] text-white text-[11px] font-medium inline-flex items-center">New consult</Link>
            <Link href="/labs" className="h-8 px-2.5 rounded-lg border bg-white text-[11px] font-medium inline-flex items-center">Labs queue</Link>
            <Link href="/prescriptions" className="h-8 px-2.5 rounded-lg border bg-white text-[11px] font-medium inline-flex items-center">Prescriptions</Link>
            {careSetting === "IPD" && (
              <Link href="/ipd-summaries" className="h-8 px-2.5 rounded-lg border bg-white text-[11px] font-medium inline-flex items-center">IPD summaries</Link>
            )}
            <Link href="/ipd" className="h-8 px-2.5 rounded-lg border bg-white text-[11px] font-medium inline-flex items-center">IPD board</Link>
          </div>
        </div>

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
            <Section title="Problems / chief complaint">
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

        {tab === "notes" && (
          <ClinicalNotesPanel
            patientId={String(id)}
            encounters={encounters}
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

        {tab === "rx" && (
          <Section title="Prescriptions / medications" action={<Link href="/prescriptions" className="text-[11px] text-[#c2183a] font-medium">Manage Rx</Link>}>
            {prescriptions.length === 0 ? <Empty text="No prescriptions on file." /> : (
              <ul className="space-y-3">
                {prescriptions.map((r: any) => (
                  <li key={r.id} className="rounded-lg border p-3 text-xs">
                    <div className="flex justify-between gap-2 mb-1">
                      <span className="font-semibold">Prescription</span>
                      <span className="text-gray-500">{formatIst(r.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{r.medicines}</p>
                    {r.advice && <p className="mt-1 text-gray-600 whitespace-pre-wrap"><b>Advice:</b> {r.advice}</p>}
                    <Link href={`/prescriptions/print?id=${encodeURIComponent(r.id)}`} className="inline-block mt-2 text-[#c2183a] font-medium">Print clinical Rx</Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-gray-400 mt-3">Inpatient scheduled MAR / dose administration is not part of this chart view.</p>
          </Section>
        )}

        {tab === "vitals" && (
          <ClinicalVitalsPanel
            patientId={String(id)}
            encounters={encounters}
            onSaved={async () => { await load(); }}
          />
        )}

        {tab === "discharge" && (
          <Section title="Discharge / IPD summary" action={<Link href="/ipd-summaries" className="text-[11px] text-[#c2183a] font-medium">Summaries</Link>}>
            <p className="text-xs text-gray-600 mb-3">
              Use IPD summaries for formal discharge documentation and clinical print. Working diagnosis on file:{" "}
              <b>{profile.workingDiagnosis || profile.diagnosis || latestEncounter?.diagnosis || "—"}</b>
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/ipd-summaries" className="h-9 px-3 rounded-lg bg-[#140a1f] text-white text-xs font-medium inline-flex items-center">Open IPD summaries</Link>
              <Link href="/ipd/print" className="h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center">IPD print</Link>
            </div>
          </Section>
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
      </div>
    </AppShell>
  );
}
