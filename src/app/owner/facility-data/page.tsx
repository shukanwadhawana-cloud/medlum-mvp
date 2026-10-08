"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDoctor } from "@/components/DoctorProvider";

type PreviewRow = {
  index: number;
  decision: string;
  reason?: string;
  name?: string;
  uhid?: string | null;
};

type PreviewResult = {
  success?: boolean;
  error?: string;
  summary?: { create: number; skip: number; conflict: number; invalid: number; total: number };
  rows?: PreviewRow[];
  destinationClinicId?: string;
  destinationClinicName?: string;
};

type CommitResult = {
  success?: boolean;
  error?: string;
  created?: number;
  skipped?: number;
  conflicted?: number;
  invalid?: number;
  total?: number;
  destinationClinicId?: string;
  destinationClinicName?: string;
};

/**
 * Owner/Admin facility demographics migration center.
 * Uses existing secure APIs: export / import/preview / import/commit.
 * Does NOT claim full Issue #62 hospital migration.
 */
export default function OwnerFacilityDataPage() {
  const { doctor, loading } = useDoctor();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [commit, setCommit] = useState<CommitResult | null>(null);
  const [packageText, setPackageText] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const isOwner =
    !!doctor && (doctor.isOwner === true || doctor.primaryRole === "Owner" || doctor.primaryRole === "Admin");

  useEffect(() => {
    setError("");
    setPreview(null);
    setCommit(null);
  }, [packageText]);

  async function runExport() {
    setBusy("export");
    setError("");
    setCommit(null);
    try {
      const res = await fetch("/api/facility-data/export", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `medlum-facility-export-${data.exportedAt || "package"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function runPreview() {
    setBusy("preview");
    setError("");
    setCommit(null);
    setPreview(null);
    try {
      let body: unknown;
      try {
        body = JSON.parse(packageText);
      } catch {
        throw new Error("Package must be valid JSON");
      }
      const res = await fetch("/api/facility-data/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function runCommit() {
    if (confirmText !== "CONFIRM") {
      setError('Type CONFIRM exactly before committing.');
      return;
    }
    setBusy("commit");
    setError("");
    setCommit(null);
    try {
      let body: unknown;
      try {
        body = JSON.parse(packageText);
      } catch {
        throw new Error("Package must be valid JSON");
      }
      const res = await fetch("/api/facility-data/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Commit failed");
      setCommit(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#f6f7fb] text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#f6f7fb]">
        <Link href="/login" className="text-[#c2183a] font-medium">
          Sign in
        </Link>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#f6f7fb] px-6 text-center">
        <div>
          <p className="font-semibold">Owner or Admin access required</p>
          <p className="mt-2 text-sm text-slate-500">
            Facility data migration is limited to Owner/Admin of the active membership facility.
          </p>
          <Link href="/owner" className="mt-3 inline-block text-[#c2183a]">
            Back to owner dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-4">
        <Link href="/owner" className="text-sm text-[#c2183a]">
          ← Owner dashboard
        </Link>
      </div>
      <div className="rounded-2xl bg-[#140a1f] p-6 text-white">
        <p className="text-xs uppercase tracking-[0.18em] text-white/50">Facility data</p>
        <h1 className="mt-2 text-2xl font-semibold">Migration center</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/65">
          Export patient demographics for the active facility, or preflight and commit an approved
          package. Destination is always your active membership facility. Master Owner is never
          replaced. This is <strong className="text-white">not</strong> full multi-entity hospital
          migration (Issue #62 remains staged).
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">1. Export (read-only)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Downloads a <code className="text-xs">medlum-facility-export-v1</code> package for the active
          facility. No writes. Secrets are never included.
        </p>
        <button
          type="button"
          disabled={!!busy}
          onClick={runExport}
          className="mt-4 rounded-xl bg-[#c2183a] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === "export" ? "Exporting…" : "Export patient demographics"}
        </button>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">2. Preflight (dry-run)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Paste a package JSON. Server validates and reports create / skip / conflict / invalid.
          No database writes.
        </p>
        <textarea
          className="mt-3 h-48 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs"
          placeholder='{ "format": "medlum-facility-export-v1", ... }'
          value={packageText}
          onChange={(e) => setPackageText(e.target.value)}
        />
        <button
          type="button"
          disabled={!!busy || !packageText.trim()}
          onClick={runPreview}
          className="mt-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50"
        >
          {busy === "preview" ? "Running preflight…" : "Run preflight"}
        </button>
        {preview?.summary && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            {(["total", "create", "skip", "conflict", "invalid"] as const).map((k) => (
              <div key={k} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs uppercase text-slate-400">{k}</p>
                <p className="mt-1 text-lg font-semibold">{preview.summary?.[k] ?? 0}</p>
              </div>
            ))}
          </div>
        )}
        {preview?.destinationClinicName && (
          <p className="mt-3 text-xs text-slate-500">
            Destination: {preview.destinationClinicName} ({preview.destinationClinicId})
          </p>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">3. Commit (writes)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Applies only after a successful mental review of preflight. Type <strong>CONFIRM</strong>{\" \"}
          exactly. Uses a single transaction; rejects the whole batch if any row is invalid.
        </p>
        <input
          className="mt-3 w-full max-w-xs rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="Type CONFIRM"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
        />
        <button
          type="button"
          disabled={!!busy || !packageText.trim() || confirmText !== "CONFIRM"}
          onClick={runCommit}
          className="mt-3 ml-0 block rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:ml-3 sm:inline-block"
        >
          {busy === "commit" ? "Committing…" : "Commit import"}
        </button>
        {commit && (
          <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Created {commit.created ?? 0}, skipped {commit.skipped ?? 0}, conflicted{" "}
            {commit.conflicted ?? 0}, invalid {commit.invalid ?? 0} (total {commit.total ?? 0})
            {commit.destinationClinicName && (
              <span className="block mt-1 text-xs">
                Destination: {commit.destinationClinicName}
              </span>
            )}
          </div>
        )}
      </section>

      <p className="mt-8 text-xs text-slate-400">
        See docs/HOSPITAL_DATA_MIGRATION_ARCHITECTURE.md.
      </p>
    </main>
  );
}
