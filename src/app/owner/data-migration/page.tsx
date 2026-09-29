"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDoctor } from "@/components/DoctorProvider";

type Clinic = { id: string; name: string; role: string; isActive: boolean };
type Overview = { ownerWorkspace?: { myClinics?: Clinic[] } };

export default function OwnerDataMigrationPage() {
  const { doctor, loading } = useDoctor();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedClinic, setSelectedClinic] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (!doctor?.isOwner) return;
    fetch("/api/owner/overview", { cache: "no-store" })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Unable to load facilities"); return j as Overview; })
      .then(j => {
        const list = j.ownerWorkspace?.myClinics || [];
        setClinics(list);
        setSelectedClinic(list[0]?.id || "");
      })
      .catch(e => setError(e instanceof Error ? e.message : "Unable to load facilities"));
  }, [doctor]);

  async function validate(file: File) {
    setError(""); setMessage(""); setValidating(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const r = await fetch("/api/owner/data-migration/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json),
      });
      const j = await r.json();
      if (!r.ok || !j.valid) throw new Error((j.errors || ["Migration package validation failed"]).join(" "));
      setMessage(`Package validated successfully (${Math.round((j.sizeBytes || 0) / 1024)} KB). It is ready for target-facility mapping and explicit import execution.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not validate package");
    } finally { setValidating(false); }
  }

  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-slate-500">Loading…</div>;
  if (!doctor?.isOwner) return <div className="min-h-screen grid place-items-center px-6 text-center"><div><p className="font-semibold">Owner access required</p><Link href="/owner" className="mt-2 inline-block text-[#c2183a]">Back to owner center</Link></div></div>;

  return <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-5xl px-4 py-4 sm:px-6"><Link href="/owner" className="text-xs text-slate-500">← Owner control center</Link><h1 className="mt-2 text-2xl font-semibold">Hospital data migration</h1><p className="mt-1 text-sm text-slate-500">Export an existing facility safely and prepare legacy hospital data for MedLum onboarding.</p></div></header>
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">1. Export existing MedLum hospital data</h2>
        <p className="mt-1 text-sm text-slate-500">Creates a structured JSON migration package containing clinic-scoped clinical and operational records. Authentication secrets and transient login/link tokens are intentionally excluded.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <select value={selectedClinic} onChange={e => setSelectedClinic(e.target.value)} className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm">
            <option value="">Select facility</option>
            {clinics.map(c => <option key={c.id} value={c.id}>{c.name} · {c.role}</option>)}
          </select>
          <a
            href={selectedClinic ? `/api/owner/data-migration/export?clinicId=${encodeURIComponent(selectedClinic)}` : "#"}
            onClick={e => { if (!selectedClinic) { e.preventDefault(); setError("Select a facility first."); } }}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#c2183a] px-5 text-sm font-semibold text-white"
          >Export hospital data</a>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">2. Prepare an existing hospital's data</h2>
        <p className="mt-1 text-sm text-slate-500">Upload a MedLum migration package to validate its structure before any records can be written. Import execution will use explicit target-facility mapping, duplicate handling and owner protection.</p>
        <label className="mt-4 block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-slate-400">
          <input type="file" accept=".json,application/json" className="hidden" disabled={validating} onChange={e => { const f = e.target.files?.[0]; if (f) void validate(f); }} />
          <p className="font-medium">{validating ? "Validating package…" : "Choose migration JSON package"}</p>
          <p className="mt-1 text-xs text-slate-500">Validation is read-only and does not change hospital data.</p>
        </label>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-sm font-semibold text-amber-900">Owner protection</h2>
        <p className="mt-1 text-sm leading-6 text-amber-800">Your existing MedLum Master Owner remains the source of truth. Imported hospital users can never replace, downgrade or take over the Master Owner. Imported authentication secrets are not accepted from migration files.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Migration coverage</h2>
        <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          {["Patients and clinical encounters","Appointments and prescriptions","Laboratory and diagnostics","Billing, invoices and payments","Blood bank and insurance","Tariffs and laboratory templates","Emergency and workforce records","Clinical notes and audit-linked records","Telemedicine clinical metadata","Facility-scoped operational records"].map(x => <div key={x} className="rounded-lg bg-slate-50 px-3 py-2">✓ {x}</div>)}
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-400">Binary/source files and authentication/link secrets are deliberately handled separately rather than copied blindly. This prevents a migration package from becoming a credential or storage takeover mechanism.</p>
      </section>
    </main>
  </div>;
}
