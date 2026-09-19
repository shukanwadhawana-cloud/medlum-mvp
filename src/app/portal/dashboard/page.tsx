"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type PortalData = {
  patient: {
    id: string; name: string; age: number; gender: string; phone: string;
    bp?: string; allergies?: string;
    clinic?: { id: string; name: string } | null;
    doctor?: { id: string; name: string } | null;
  };
  appointments: Array<{ id: string; date: string; time: string; type: string; status: string; doctor?: { name: string } | null }>;
  prescriptions: Array<{ id: string; medicines: string; advice: string; createdAt: string; doctor?: { name: string } | null }>;
  labs: Array<{ id: string; testName: string; category: string; status: string; result: string; notes: string; orderedAt: string; doctor?: { name: string } | null }>;
  diagnostics: Array<{ id: string; studyName: string; modality: string; bodyPart: string; status: string; findings: string; impression: string; orderedAt: string }>;
  invoices: Array<{ id: string; total?: number | null; amount: number; status: string; note: string; createdAt: string }>;
  policies: Array<{ id: string; policyNumber: string; planName: string; status: string; provider?: { name: string } | null }>;
  claims: Array<{ id: string; claimType: string; status: string; requestedAmount: number; policy?: { provider?: { name: string } | null } | null }>;
  encounters: Array<{ id: string; date: string; chiefComplaint: string; diagnosis: string; assessment: string; plan: string; followUpDate?: string | null; bp: string; pulse: string; temperature: string; spo2: string; weight: string; height: string; createdAt: string; doctor?: { name: string } | null }>;
};

type Tab = "home" | "appointments" | "records" | "medications" | "labs" | "vitals" | "timeline" | "documents" | "profile";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" }, { id: "appointments", label: "Appointments" }, { id: "records", label: "Records" },
  { id: "medications", label: "Medications" }, { id: "labs", label: "Labs" }, { id: "vitals", label: "Vitals" },
  { id: "timeline", label: "Timeline" }, { id: "documents", label: "Documents" }, { id: "profile", label: "Profile" },
];

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n));
}
function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0] || name}`;
}
function isUpcoming(s: string) { return ["Scheduled", "Confirmed", "Upcoming"].includes(s); }
function Empty({ title, hint }: { title: string; hint?: string }) {
  return <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center"><div className="text-sm font-medium text-gray-700">{title}</div>{hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}</div>;
}
function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-[#140a1f]">{title}</h2>{action}</div>{children}</section>;
}
function Row({ title, sub, extra, badge, badgeTone }: { title: string; sub?: string; extra?: string; badge?: string; badgeTone?: "neutral" | "success" | "warn" | "danger" }) {
  const tone = badgeTone === "success" ? "bg-green-50 text-green-800" : badgeTone === "warn" ? "bg-amber-50 text-amber-800" : badgeTone === "danger" ? "bg-red-50 text-red-800" : "bg-gray-100 text-gray-700";
  return <div className="border-b border-gray-100 py-3 last:border-0"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-sm font-medium text-[#140a1f] truncate">{title}</div>{sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}{extra && <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{extra}</div>}</div>{badge && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>{badge}</span>}</div></div>;
}

export default function PortalDashboard() {
  const router = useRouter();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("home");
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/portal/data", { credentials: "include", cache: "no-store" });
      if (r.status === 401) { router.replace("/portal/login"); return; }
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Unable to load your health summary"); }
      setData(await r.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load dashboard"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/portal/auth/logout", { method: "POST", credentials: "include", headers: { "X-MedLum-Requested-With": "MedLum" } });
    } finally { router.replace("/portal/login"); router.refresh(); }
  }

  const timeline = useMemo(() => {
    if (!data) return [];
    const items: { at: string; kind: string; title: string; detail?: string }[] = [];
    for (const a of data.appointments) items.push({ at: a.date, kind: "Appointment", title: `${a.type} · ${a.status}`, detail: `${a.date} ${a.time}${a.doctor?.name ? ` · Dr. ${a.doctor.name}` : ""}` });
    for (const e of data.encounters || []) items.push({ at: e.date || e.createdAt, kind: "Consultation", title: e.diagnosis || e.chiefComplaint || "Clinical visit", detail: e.doctor?.name ? `Dr. ${e.doctor.name}` : undefined });
    for (const p of data.prescriptions) items.push({ at: p.createdAt, kind: "Prescription", title: (p.medicines || "Prescription").slice(0, 80), detail: p.doctor?.name ? `Dr. ${p.doctor.name}` : undefined });
    for (const l of data.labs) items.push({ at: l.orderedAt, kind: "Lab", title: l.testName, detail: l.result || l.status });
    for (const d of data.diagnostics) items.push({ at: d.orderedAt, kind: "Imaging", title: d.studyName, detail: d.impression || d.status });
    return items.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 40);
  }, [data]);

  const upcoming = useMemo(() => (data?.appointments || []).filter((a) => isUpcoming(a.status)), [data]);
  const pastAppts = useMemo(() => (data?.appointments || []).filter((a) => !isUpcoming(a.status)), [data]);

  if (loading) return <main className="min-h-screen bg-[#f5f5f7] p-4"><div className="mx-auto max-w-3xl space-y-3 animate-pulse"><div className="h-14 rounded-2xl bg-white border" /><div className="h-28 rounded-2xl bg-white border" /><div className="h-40 rounded-2xl bg-white border" /></div></main>;
  if (error && !data) return <main className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4"><div className="max-w-sm rounded-2xl border bg-white p-6 text-center"><p className="text-sm text-red-700">{error}</p><button type="button" onClick={() => void load()} className="mt-4 h-10 rounded-lg bg-[#140a1f] px-4 text-sm text-white">Retry</button><Link href="/portal/login" className="mt-3 block text-xs text-[#c2183a]">Back to sign in</Link></div></main>;
  if (!data) return null;
  const p = data.patient;

  return (
    <main className="min-h-screen bg-[#f5f5f7] pb-24">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0"><div className="text-sm font-bold text-[#140a1f]">MedLum</div><div className="truncate text-xs text-gray-500">{p.name}</div></div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c2183a]/10 text-xs font-semibold text-[#c2183a]" aria-hidden>{(p.name || "?").slice(0, 1).toUpperCase()}</div>
            <button type="button" onClick={() => void logout()} disabled={loggingOut} className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 disabled:opacity-50">{loggingOut ? "…" : "Log out"}</button>
          </div>
        </div>
        <nav className="mx-auto max-w-3xl overflow-x-auto px-2 pb-2" aria-label="Portal sections">
          <div className="flex gap-1 min-w-max">{TABS.map((t) => <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap ${tab === t.id ? "bg-[#c2183a] text-white" : "bg-gray-100 text-gray-700"}`}>{t.label}</button>)}</div>
        </nav>
      </header>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {tab === "home" && (<>
          <section className="rounded-2xl bg-[#140a1f] p-5 text-white"><div className="text-lg font-semibold">{greeting(p.name)}</div><p className="mt-1 text-sm text-white/70">Here&apos;s your health summary.</p>{p.clinic?.name && <p className="mt-3 text-xs text-white/60">{p.clinic.name}</p>}</section>
          <Card title="Patient summary">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-[10px] uppercase text-gray-400">Name</div><div className="font-medium">{p.name}</div></div>
              <div><div className="text-[10px] uppercase text-gray-400">Age · Sex</div><div className="font-medium">{p.age} · {p.gender}</div></div>
              <div><div className="text-[10px] uppercase text-gray-400">Phone</div><div className="font-medium">{p.phone || "—"}</div></div>
              <div><div className="text-[10px] uppercase text-gray-400">Patient ID</div><div className="font-medium text-xs break-all">{p.id.slice(0, 12)}…</div></div>
              {p.doctor?.name && <div><div className="text-[10px] uppercase text-gray-400">Doctor</div><div className="font-medium">Dr. {p.doctor.name}</div></div>}
              {p.clinic?.name && <div><div className="text-[10px] uppercase text-gray-400">Clinic</div><div className="font-medium">{p.clinic.name}</div></div>}
              {p.allergies ? <div className="col-span-2"><div className="text-[10px] uppercase text-gray-400">Allergies</div><div className="font-medium text-amber-800">{p.allergies}</div></div> : null}
            </div>
          </Card>
          <Card title="Upcoming appointments" action={<button type="button" className="text-xs text-[#c2183a]" onClick={() => setTab("appointments")}>View all</button>}>
            {upcoming.length === 0 ? <Empty title="No upcoming appointments" hint="Your clinic will schedule visits here." /> : upcoming.slice(0, 3).map((a) => <Row key={a.id} title={`${a.date} · ${a.time}`} sub={`${a.type}${a.doctor?.name ? ` · Dr. ${a.doctor.name}` : ""}`} badge={a.status} badgeTone="success" />)}
          </Card>
          <Card title="Recent activity">{timeline.length === 0 ? <Empty title="No recent activity" /> : timeline.slice(0, 5).map((t, i) => <Row key={`${t.kind}-${i}`} title={t.title} sub={`${t.kind}${t.detail ? ` · ${t.detail}` : ""}`} />)}</Card>
        </>)}
        {tab === "appointments" && (<>
          <Card title="Upcoming">{upcoming.length === 0 ? <Empty title="No upcoming appointments" /> : upcoming.map((a) => <Row key={a.id} title={`${a.date} · ${a.time}`} sub={a.type} badge={a.status} badgeTone="success" />)}</Card>
          <Card title="Previous">{pastAppts.length === 0 ? <Empty title="No previous appointments on record" /> : pastAppts.map((a) => <Row key={a.id} title={`${a.date} · ${a.time}`} sub={a.type} badge={a.status} />)}</Card>
        </>)}
        {tab === "records" && <Card title="Consultation records">{(data.encounters || []).length === 0 ? <Empty title="No consultation records yet" /> : (data.encounters || []).map((e) => <Row key={e.id} title={e.diagnosis || e.chiefComplaint || "Consultation"} sub={e.date} extra={[e.assessment, e.plan].filter(Boolean).join("\n")} />)}</Card>}
        {tab === "medications" && <Card title="My medications">{data.prescriptions.length === 0 ? <Empty title="No prescriptions on record" /> : data.prescriptions.map((rx) => <Row key={rx.id} title={rx.medicines || "Prescription"} sub={new Date(rx.createdAt).toLocaleDateString("en-IN")} extra={rx.advice || undefined} />)}</Card>}
        {tab === "labs" && (<>
          <Card title="Lab results">{data.labs.length === 0 ? <Empty title="No lab results yet" /> : data.labs.map((l) => <Row key={l.id} title={l.testName} sub={l.category} extra={l.result || undefined} badge={l.status} />)}</Card>
          <Card title="Imaging">{data.diagnostics.length === 0 ? <Empty title="No imaging reports yet" /> : data.diagnostics.map((d) => <Row key={d.id} title={d.studyName} sub={d.modality} extra={d.impression || undefined} />)}</Card>
        </>)}
        {tab === "vitals" && <Card title="Vitals">{(() => {
          const latest = (data.encounters || []).find((e) => e.bp || e.pulse || e.temperature || e.spo2 || e.weight || e.height);
          if (!latest && !p.bp) return <Empty title="No vitals recorded yet" />;
          const rows = [["Blood pressure", latest?.bp || p.bp || ""], ["Pulse", latest?.pulse || ""], ["Temperature", latest?.temperature || ""], ["SpO₂", latest?.spo2 || ""], ["Weight", latest?.weight || ""], ["Height", latest?.height || ""]].filter(([, v]) => v);
          return <div className="grid grid-cols-2 gap-3">{rows.map(([k, v]) => <div key={k} className="rounded-xl bg-gray-50 p-3"><div className="text-[10px] uppercase text-gray-400">{k}</div><div className="text-sm font-semibold">{v}</div></div>)}</div>;
        })()}</Card>}
        {tab === "timeline" && <Card title="Health timeline">{timeline.length === 0 ? <Empty title="Timeline is empty" /> : timeline.map((t, i) => <Row key={`${t.kind}-${i}`} title={t.title} sub={`${t.kind} · ${t.at}`} />)}</Card>}
        {tab === "documents" && (<>
          <Card title="Prescriptions">{data.prescriptions.length === 0 ? <Empty title="No prescription documents" /> : data.prescriptions.map((rx) => <Row key={rx.id} title="Prescription" sub={new Date(rx.createdAt).toLocaleDateString("en-IN")} extra={rx.medicines} />)}</Card>
          <Card title="Bills">{data.invoices.length === 0 ? <Empty title="No bills on record" /> : data.invoices.map((inv) => <Row key={inv.id} title={money(inv.total ?? inv.amount)} sub={inv.status} />)}</Card>
          <Card title="Insurance">{data.policies.length === 0 && data.claims.length === 0 ? <Empty title="No insurance documents" /> : (<>{data.policies.map((pol) => <Row key={pol.id} title={pol.provider?.name || "Policy"} sub={pol.policyNumber} badge={pol.status} />)}{data.claims.map((c) => <Row key={c.id} title={c.policy?.provider?.name || "Claim"} sub={c.claimType} badge={c.status} />)}</>)}</Card>
        </>)}
        {tab === "profile" && <Card title="My profile"><div className="space-y-3 text-sm">{[["Full name", p.name], ["Age", String(p.age)], ["Sex", p.gender], ["Phone", p.phone || "—"], ["Clinic", p.clinic?.name || "—"], ["Doctor", p.doctor?.name ? `Dr. ${p.doctor.name}` : "—"], ["Allergies", p.allergies || "None recorded"]].map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-gray-100 pb-2"><span className="text-gray-500">{k}</span><span className="font-medium text-right">{v}</span></div>)}<p className="text-xs text-gray-400 pt-2">Demographics are managed by your clinic.</p></div></Card>}
      </div>
    </main>
  );
}
