"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDoctor } from "@/components/DoctorProvider";

type PreviewSummary = {
  total: number;
  wouldCreate: number;
  duplicateMatches: number;
  conflicts: number;
  invalid: number;
};

type PreviewResult = {
  valid: boolean;
  summary: PreviewSummary;
  rows?: Array<{ index: number; decision: string; reason: string }>;
};

type CommitResult = {
  success: boolean;
  created: number;
  skippedDuplicates: number;
  rejected: number;
  conflicts: number;
  errors: string[];
};

/**
 * Owner/Admin facility data migration center.
 * Uses server membership for destination facility — never trusts client clinic IDs.
 * Export / preview / commit only; large multi-entity hospital migration is out of band.
 */
export default function FacilityDataMigrationPage() {
  const { doctor, loading } = useDoctor();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [packageJson, setPackageJson] = useState<unknown>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!doctor) return;
  }, [doctor, loading]);

  async function runExport() {
    setError("");
    setMessage("");
    setExporting(true);
    try {
      const r = await fetch("/api/facility-data/export", { credentials: "include", cache: "no-store" });
      const text = await r.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      if (!r.ok) {
        const err =
          body && typeof body === "object" && "error" in body
            ? String((body as { error?: string }).error)
            : "Export failed.";
        throw new Error(err);
      }
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `medlum-facility-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Export downloaded. Secrets are never included. Destination on import is always your active facility membership.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function runPreview(file: File) {
    setError("");
    setMessage("");
    setPreview(null);
    setPackageJson(null);
    setConfirmText("");
    setPreviewing(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      setPackageJson(json);
      const r = await fetch("/api/facility-data/import/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(j.error || (j.result?.errors?.[0] as string) || "Preview failed");
      }
      const result = (j.result || j) as PreviewResult;
      setPreview(result);
      if (!result.valid) {
        setMessage("Preflight completed with blocking issues. No records were written.");
      } else {
        setMessage("Preflight passed. Review counts, then type CONFIRM and commit. No records have been written yet.");
      }
    } catch (e) {
      setPackageJson(null);
      setError(e instanceof Error ? e.message : "Could not preview package");
    } finally {
      setPreviewing(false);
    }
  }

  async function runCommit() {
    if (!packageJson || !preview?.valid) return;
    if (confirmText.trim() !== "CONFIRM") {
      setError("Type CONFIRM exactly to enable commit.");
      return;
    }
    setError("");
    setMessage("");
    setCommitting(true);
    try {
      const r = await fetch("/api/facility-data/import/commit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(packageJson),
      });
      const j = await r.json();
      const result = (j.result || j) as CommitResult;
      if (!r.ok || !result.success) {
        throw new Error(j.error || result.errors?.[0] || "Commit failed");
      }
      setPackageJson(null);
      setPreview(null);
      setConfirmText("");
      setMessage(
        `Import committed: ${result.created} created, ${result.skippedDuplicates} duplicates skipped, ${result.conflicts} conflicts, ${result.rejected} rejected. Master Owner identity is never imported.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }

  if (loading || !doctor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#140a1f] text-white text-sm">
        Loading…
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <Link href="/owner" className="text-sm font-medium text-[#c2183a]">
          ← Owner dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Facility data migration</h1>
        <p className="mt-2 text-sm text-slate-600">
          Export patient demographics for the active facility, or validate and commit an approved package.
          Destination facility is always the authenticated membership — client facility IDs are ignored.
          Passwords, sessions, and secrets are never exported or imported.
        </p>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Scope of this tool</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900/90">
          <li>Structured patient demographics only (format medlum-facility-export-v1).</li>
          <li>Batch limit enforced server-side; not for multi-GB hospital archives.</li>
          <li>Clinical objects (files, images) use object storage (R2 when configured) and migrate separately.</li>
          <li>Master Owner is never replaced by imported records.</li>
        </ul>
      </section>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">1. Export current facility</h2>
        <p className="mt-1 text-sm text-slate-500">
          Downloads a JSON package for the active clinic membership. Owner or Admin only.
        </p>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void runExport()}
          className="mt-4 h-11 rounded-xl bg-[#c2183a] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Download export package"}
        </button>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">2. Preflight (no writes)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload a package to validate schema, duplicates, and conflicts. Nothing is written until step 3.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          disabled={previewing}
          className="mt-4 block w-full text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void runPreview(f);
          }}
        />
        {preview && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {(
              [
                ["Total", preview.summary.total],
                ["Would create", preview.summary.wouldCreate],
                ["Duplicates", preview.summary.duplicateMatches],
                ["Conflicts", preview.summary.conflicts],
                ["Invalid", preview.summary.invalid],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">3. Commit (explicit)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Creates only non-conflicting new patients inside a transaction. Existing clinical rows are never overwritten.
        </p>
        <label className="mt-4 block text-xs font-medium text-slate-600">
          Type CONFIRM to enable commit
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={!preview?.valid || !packageJson || committing}
            className="mt-1 h-11 w-full rounded-xl border px-3 text-sm"
            placeholder="CONFIRM"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          disabled={!preview?.valid || !packageJson || confirmText.trim() !== "CONFIRM" || committing}
          onClick={() => void runCommit()}
          className="mt-4 h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {committing ? "Committing…" : "Commit import to active facility"}
        </button>
      </section>

      <p className="mt-8 text-xs text-slate-400">
        Large multi-entity hospital migrations (encounters, IPD, objects) use manifests, chunking, and off-request
        processing — not a single browser upload. See docs/HOSPITAL_DATA_MIGRATION_ARCHITECTURE.md.
      </p>
    </main>
  );
}
