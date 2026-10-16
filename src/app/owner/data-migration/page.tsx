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
  const [packageData, setPackageData] = useState<unknown>(null);
  const [readyToImport, setReadyToImport] = useState(false);
  const [importing, setImporting] = useState(false);

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
    setError(""); setMessage(""); setReadyToImport(false); setValidating(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      setPackageData(json);
      const r = await fetch("/api/owner/data-migration/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: json, targetClinicId: selectedClinic }),
      });
      const j = await r.json();
      if (!r.ok || !j.valid) throw new Error((j.errors || ["Migration package preflight failed"]).join(" "));
      setReadyToImport(true);
      setMessage("Package preflight passed. No records were written. Review the target facility and click Import to commit the migration atomically.");
    } catch (e) {
      setPackageData(null);
      setError(e instanceof Error ? e.message : "Could not validate package");
    } finally { setValidating(false); }
  }

  async function executeImport() {
    if (!packageData || !selectedClinic) return;
    setError(""); setMessage(""); setImporting(true);
    try {
      const r = await fetch("/api/owner/data-migration/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: packageData, targetClinicId: selectedClinic, execute: true }),
      });
      const j = await r.json();
      if (!r.ok || !j.executed) throw new Error((j.errors || ["Migration failed"]).join(" "));
      setReadyToImport(false);
      setPackageData(null);
      setMessage("Migration completed. Existing Master Owner was preserved. Sensitive authentication/storage records remain intentionally deferred.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally { setImporting(false); }
  }

  if (loading) {
    return <main className="mx-auto max-w-5xl p-6">Loading owner workspace…</main>;
  }

  if (!doctor?.isOwner) {
    return <main className="mx-auto max-w-5xl p-6"><h1 className="text-xl font-semibold">Owner access required</h1><p className="mt-2 text-sm text-slate-600">Hospital data migration is available only to the MedLum Master Owner.</p><Link className="mt-4 inline-block underline" href="/owner">Return to owner workspace</Link></main>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/owner" className="text-sm text-slate-600 underline">← Owner workspace</Link>
        <h1 className="mt-3 text-2xl font-semibold">Hospital data migration</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">Export a facility package or validate a migration package before importing. Existing records are not overwritten, and the current MedLum Master Owner must remain unchanged.</p>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">1. Select facility</h2>
        <label htmlFor="migration-clinic" className="mt-3 block text-sm font-medium">Hospital / clinic</label>
        <select id="migration-clinic" value={selectedClinic} onChange={e => { setSelectedClinic(e.target.value); setReadyToImport(false); setPackageData(null); setMessage(""); }} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" disabled={clinics.length === 0}>
          {clinics.map(clinic => <option key={clinic.id} value={clinic.id}>{clinic.name}{clinic.isActive ? "" : " (inactive)"}</option>)}
        </select>
        {clinics.length === 0 && <p className="mt-2 text-sm text-slate-600">No facilities are available in the owner workspace.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">2. Export existing data</h2>
        <p className="mt-2 text-sm text-slate-600">Exports a facility-scoped JSON package. Keep the downloaded file secure because it may contain sensitive clinical information.</p>
        <a href={selectedClinic ? `/api/owner/data-migration/export?clinicId=${encodeURIComponent(selectedClinic)}` : undefined} aria-disabled={!selectedClinic} className={`mt-4 inline-flex rounded-lg px-4 py-2 text-sm font-semibold ${selectedClinic ? "bg-slate-900 text-white" : "pointer-events-none bg-slate-200 text-slate-500"}`}>Download facility export</a>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">3. Validate and preview import</h2>
        <p className="mt-2 text-sm text-slate-600">Choose a MedLum migration JSON package. Validation must pass before the explicit import step becomes available. Unsupported or sensitive account/storage records remain deferred.</p>
        <label htmlFor="migration-file" className="mt-4 block text-sm font-medium">Migration package (.json)</label>
        <input id="migration-file" type="file" accept=".json,application/json" disabled={!selectedClinic || validating || importing} onChange={e => { const file = e.target.files?.[0]; if (file) void validate(file); e.currentTarget.value = ""; }} className="mt-2 block w-full text-sm" />
        {validating && <p className="mt-3 text-sm text-slate-600">Validating package…</p>}
        {readyToImport && packageData !== null && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Preflight passed. No records have been written.</p>
          <p className="mt-1 text-sm text-amber-800">Confirm that the selected target facility is correct. Existing IDs are never overwritten; resolve conflicts before retrying.</p>
          <button type="button" onClick={() => void executeImport()} disabled={importing || !selectedClinic} className="mt-3 rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{importing ? "Importing…" : "Confirm and import"}</button>
        </div>}
      </section>
    </main>
  );
}
