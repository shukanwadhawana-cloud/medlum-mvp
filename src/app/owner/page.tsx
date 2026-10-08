"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDoctor } from "@/components/DoctorProvider";

type Hospital = { id: string; name: string; doctors: number; patients: number; invoices: number; activeIpd: number; collectedRevenue: number };
type Workspace = { id: string; name: string; role: string };
type Overview = { ownerWorkspace: { existingWorkspace: Workspace; myClinics: { id: string; name: string; role: string; isActive: boolean }[]; clinicalWorkspacePath: string; dataPreserved: boolean }; platform: { activeHospitals: number; activeDoctors: number; totalPatients: number; opdPatients: number; ipdPatients: number; appointments: number; encounters: number; grossClinicalBilling: number; collectedClinicalRevenue: number; outstandingClinicalBilling: number; collectedThisMonth: number; platformRevenue: number | null }; hospitals: Hospital[] };

const products = [
  { name: "Hospitals", description: "Hospital operations, OPD and IPD", status: "Live", href: "/owner/hospitals", detail: "Current MedLum product" },
  { name: "Clinics", description: "Clinic operations", status: "Planned", href: null, detail: "Coming next" },
  { name: "Diagnostics", description: "Lab and imaging", status: "Planned", href: null, detail: "Roadmap" },
  { name: "Pharmacy", description: "Pharmacy operations", status: "Planned", href: null, detail: "Roadmap" },
  { name: "Insurance", description: "Payer workflows", status: "Planned", href: null, detail: "Roadmap" },
];

function money(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
}

export default function OwnerHomePage() {
  const { doctor, logout, loading } = useDoctor(); const [data, setData] = useState<Overview | null>(null); const [error, setError] = useState("");
  useEffect(() => { if (!doctor?.isOwner && doctor?.primaryRole !== "Owner") return; fetch("/api/owner/overview", { cache: "no-store" }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Unable to load owner dashboard"); return d; }).then(setData).catch(e => setError(e instanceof Error ? e.message : "Unable to load owner dashboard")); }, [doctor]);
  if (loading) return <div className="min-h-screen grid place-items-center bg-[#f6f7fb] text-sm text-slate-500">Loading…</div>;
  if (!doctor) return <div className="min-h-screen grid place-items-center bg-[#f6f7fb]"><Link href="/login" className="text-[#c2183a] font-medium">Sign in</Link></div>;
  const isOwner = doctor.isOwner === true || doctor.primaryRole === "Owner";
  if (!isOwner) return <div className="min-h-screen grid place-items-center bg-[#f6f7fb] px-6 text-center"><div><p className="font-semibold">Owner access required</p><Link href="/dashboard" className="mt-2 inline-block text-[#c2183a]">Open clinical workspace</Link></div></div>;
  const s = data?.platform; const workspace = data?.ownerWorkspace?.existingWorkspace;
  const cards = [["Hospitals", s?.activeHospitals, "Active facilities"], ["Doctors", s?.activeDoctors, "Active accounts"], ["Patients", s?.totalPatients, `${s?.opdPatients ?? 0} OPD · ${s?.ipdPatients ?? 0} IPD`], ["Clinical encounters", s?.encounters, "Recorded encounters"]];
  return (
    <div className="min-h-screen bg-[#f6f7fb]">
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6"><div className="rounded-2xl bg-[#140a1f] p-6 text-white"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs uppercase tracking-[0.18em] text-white/50">MedLum platform</p><h1 className="mt-2 text-2xl font-semibold">Good to see you, {doctor.name.split(" ")[0]}</h1><p className="mt-1 max-w-2xl text-sm text-white/65">One owner dashboard for every MedLum business. Hospitals are live today; new products can be activated here as they are built.</p></div>{workspace ? <Link href="/dashboard" className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900">Open {workspace.name} workspace →</Link> : <Link href="/dashboard" className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900">Open clinical workspace →</Link>}</div></div>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="mt-6"><div><h2 className="text-xl font-semibold">MedLum businesses</h2><p className="mt-1 text-sm text-slate-500">The platform-level view stays separate from each business's operational dashboard.</p></div><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{products.map(p => { const content = <div className="h-full rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-semibold">{p.name}</p><p className="mt-1 text-sm text-slate-500">{p.description}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${p.status === "Live" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{p.status}</span></div><p className="mt-5 text-xs text-slate-400">{p.detail}</p>{p.status === "Live" && <p className="mt-2 text-sm font-medium text-[#c2183a]">Open dashboard →</p>}</div>; return p.href ? <Link key={p.name} href={p.href}>{content}</Link> : <div key={p.name}>{content}</div>; })}</div></section>
      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <Link href="/workforce" className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-semibold">People & HR</p><p className="mt-1 text-sm text-slate-500">Manage MedLum people and workforce operations from the owner workspace.</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Live</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500"><span>Staff & HRIS</span><span>Attendance / Punch In-Out</span><span>Leave & approvals</span><span>Payroll & expenses</span></div>
          <p className="mt-4 text-sm font-medium text-[#c2183a]">Open People →</p>
        </Link>
        <Link href="/dashboard" className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm">
          <p className="text-lg font-semibold">Clinical Workspace</p><p className="mt-1 text-sm text-slate-500">Jump directly back into your own clinical workspace without leaving the owner control center.</p>
          <p className="mt-5 text-sm font-medium text-[#c2183a]">Open clinical workspace →</p>
        </Link>
        <Link href="/owner/hospitals" className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm">
          <p className="text-lg font-semibold">Facilities & Hospitals</p><p className="mt-1 text-sm text-slate-500">View facilities, owners and operational workspaces from the platform level.</p>
          <p className="mt-5 text-sm font-medium text-[#c2183a]">Open facilities →</p>
        </Link>
        <Link href="/owner/facility-data" className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm">
          <p className="text-lg font-semibold">Facility data migration</p><p className="mt-1 text-sm text-slate-500">Export patient demographics or preflight/commit an approved package into the active facility. Owner/Admin only; Master Owner is never replaced.</p>
          <p className="mt-5 text-sm font-medium text-[#c2183a]">Open migration center →</p>
        </Link>
      </section>
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, sub]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold">{value ?? "—"}</p><p className="mt-1 text-xs text-slate-400">{sub}</p></div>)}</section>
      <section className="mt-6 grid gap-4 lg:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Collected clinical revenue</p><p className="mt-2 text-2xl font-semibold">{s ? money(s.collectedClinicalRevenue) : "—"}</p><p className="mt-1 text-xs text-slate-400">Recorded patient payments across MedLum facilities</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">This month</p><p className="mt-2 text-2xl font-semibold">{s ? money(s.collectedThisMonth) : "—"}</p><p className="mt-1 text-xs text-slate-400">Payments received since the start of this month</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">MedLum platform revenue</p><p className="mt-2 text-2xl font-semibold">{s?.platformRevenue == null ? "Not tracked" : money(s.platformRevenue)}</p><p className="mt-1 text-xs text-slate-400">Keep platform subscriptions separate from clinical patient payments.</p></div></section>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-lg font-semibold">Your clinical workspace</h2><p className="mt-1 text-sm text-slate-500">Platform ownership stays separate from day-to-day clinical work. Existing patient and hospital data remains intact.</p></div>{workspace && <Link href="/dashboard" className="rounded-xl bg-[#c2183a] px-4 py-2.5 text-sm font-semibold text-white">Continue in {workspace.name}</Link>}</div>{data?.ownerWorkspace?.dataPreserved && <p className="mt-3 text-xs text-emerald-700">Clinical data for your membership facility is preserved and accessible from the clinical workspace.</p>}</section>
      <section className="mt-8"><div className="flex items-end justify-between"><div><h2 className="text-xl font-semibold">Hospitals</h2><p className="mt-1 text-sm text-slate-500">Live product dashboard for hospital operations, including OPD and IPD.</p></div><Link href="/owner/hospitals" className="text-sm font-medium text-[#c2183a]">View all</Link></div><div className="mt-4 grid gap-4 lg:grid-cols-2">{(data?.hospitals ?? []).slice(0, 4).map(h => <Link key={h.id} href={`/owner/hospitals?id=${encodeURIComponent(h.id)}`} className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm"><div className="flex items-start justify-between"><div><p className="text-lg font-semibold">{h.name}</p><p className="mt-1 text-xs text-slate-400">Hospital / clinic facility</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">Active</span></div><div className="mt-5 grid grid-cols-3 gap-3 text-sm"><div><p className="text-slate-400">Doctors</p><p className="mt-1 font-semibold">{h.doctors}</p></div><div><p className="text-slate-400">Patients</p><p className="mt-1 font-semibold">{h.patients}</p></div><div><p className="text-slate-400">IPD</p><p className="mt-1 font-semibold">{h.activeIpd}</p></div></div><div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">Collected billing: <span className="font-medium text-slate-700">{money(h.collectedRevenue)}</span></div></Link>)}{!data?.hospitals.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 sm:col-span-2">No active hospitals are connected yet. Your existing clinical workspace remains available above.</div>}</div></section>
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Appointments", s?.appointments], ["IPD patients", s?.ipdPatients], ["OPD patients", s?.opdPatients], ["Outstanding billing", s ? money(s.outstandingClinicalBilling) : "—"]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold">{value ?? "—"}</p></div>)}</section>
      <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400"><Link href="/pricing" className="hover:text-slate-600">Pricing</Link><Link href="/help" className="hover:text-slate-600">Help</Link><Link href="/faq" className="hover:text-slate-600">FAQs</Link><span>These are secondary resources, not the owner dashboard.</span></div>
    </main></div>);
}
