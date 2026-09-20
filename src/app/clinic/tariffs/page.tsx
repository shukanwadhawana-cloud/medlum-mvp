"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";

type Version = {
  id: string; name: string; version: string; isActive: boolean;
  sourceFile: string; notes: string; createdAt: string; _count?: { items: number };
};

type InspectResult = {
  success: boolean; mode?: string; sheets?: string[]; usedSheet?: string;
  headers?: string[]; suggestedMapping?: Record<string, string>;
  previewSample?: string[][]; rowCount?: number; validCount?: number;
  errorCount?: number; errors?: { row: number; message: string }[];
  version?: Version; imported?: number; error?: string;
};

const MAP_FIELDS = [
  { key: "code", label: "Item / Code" },
  { key: "name", label: "Service / Name" },
  { key: "category", label: "Category / Ward" },
  { key: "department", label: "Department" },
  { key: "unitPrice", label: "Hospital Tariff / Rate" },
  { key: "esicCode", label: "ESIC Code" },
  { key: "esicCategory", label: "ESIC Category" },
  { key: "notes", label: "Notes" },
];

const CSRF_HEADERS = { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" } as const;

export default function TariffImportPage() {
  const { doctor, loading: authLoading } = useDoctor();
  const [versions, setVersions] = useState<Version[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [excelB64, setExcelB64] = useState("");
  const [csvText, setCsvText] = useState("");
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<InspectResult | null>(null);
  const [tariffName, setTariffName] = useState("Hospital Tariff");
  const [tariffVersion, setTariffVersion] = useState(() => new Date().toISOString().slice(0, 10));
  const [activate, setActivate] = useState(false);

  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch("/api/tariffs", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setVersions(data.versions || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!authLoading && doctor) loadVersions();
  }, [authLoading, doctor, loadVersions]);

  async function onFile(file: File | null) {
    setErr(""); setMsg(""); setPreview(null); setSheets([]); setHeaders([]);
    setExcelB64(""); setCsvText("");
    if (!file) return;
    setFileName(file.name);
    if (file.size > 2_000_000) { setErr("File too large (max 2MB)"); return; }
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
      const text = await file.text();
      setCsvText(text);
      setBusy(true);
      try {
        const res = await fetch("/api/tariffs/import", {
          method: "POST", credentials: "include",
          headers: CSRF_HEADERS,
          body: JSON.stringify({ csv: text, sourceFile: file.name, mode: "preview" }),
        });
        const data: InspectResult = await res.json();
        if (!res.ok || !data.success) { setErr(data.error || "Inspect failed"); return; }
        setHeaders(data.headers || []);
        setMapping(data.suggestedMapping || {});
        setPreview(data);
        setMsg(`Detected ${data.rowCount ?? 0} rows`);
      } finally { setBusy(false); }
      return;
    }
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      setExcelB64(b64);
      setBusy(true);
      try {
        const res = await fetch("/api/tariffs/import", {
          method: "POST", credentials: "include",
          headers: CSRF_HEADERS,
          body: JSON.stringify({ excelBase64: b64, sourceFile: file.name, mode: "preview" }),
        });
        const data: InspectResult = await res.json();
        if (!res.ok || !data.success) { setErr(data.error || "Inspect failed"); return; }
        setSheets(data.sheets || []);
        setSheetName(data.usedSheet || (data.sheets?.[0] ?? ""));
        setHeaders(data.headers || []);
        setMapping(data.suggestedMapping || {});
        setPreview(data);
        setMsg(`Sheet "${data.usedSheet}" · ${data.rowCount ?? 0} rows`);
      } finally { setBusy(false); }
      return;
    }
    setErr("Supported formats: .xlsx, .xls, .csv");
  }

  async function changeSheet(name: string) {
    setSheetName(name);
    if (!excelB64) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/tariffs/import", {
        method: "POST", credentials: "include",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ excelBase64: excelB64, sheetName: name, sourceFile: fileName, mode: "preview" }),
      });
      const data: InspectResult = await res.json();
      if (!res.ok || !data.success) { setErr(data.error || "Sheet inspect failed"); return; }
      setHeaders(data.headers || []);
      setMapping(data.suggestedMapping || {});
      setPreview(data);
      setMsg(`Sheet "${data.usedSheet}" · ${data.rowCount ?? 0} rows`);
    } finally { setBusy(false); }
  }

  async function runPreview() {
    setBusy(true); setErr("");
    try {
      const body: Record<string, unknown> = { mode: "preview", mapping, sourceFile: fileName };
      if (excelB64) { body.excelBase64 = excelB64; body.sheetName = sheetName; }
      else if (csvText) body.csv = csvText;
      else { setErr("No file loaded"); return; }
      const res = await fetch("/api/tariffs/import", {
        method: "POST", credentials: "include",
        headers: CSRF_HEADERS,
        body: JSON.stringify(body),
      });
      const data: InspectResult = await res.json();
      if (!res.ok || !data.success) { setErr(data.error || "Validation failed"); return; }
      setPreview(data);
      setMsg(`Valid: ${data.validCount} · Errors: ${data.errorCount}`);
    } finally { setBusy(false); }
  }

  async function commitImport() {
    setBusy(true); setErr("");
    try {
      const body: Record<string, unknown> = {
        mode: "commit", mapping, sourceFile: fileName, name: tariffName, version: tariffVersion, activate,
      };
      if (excelB64) { body.excelBase64 = excelB64; body.sheetName = sheetName; }
      else if (csvText) body.csv = csvText;
      else { setErr("No file loaded"); return; }
      const res = await fetch("/api/tariffs/import", {
        method: "POST", credentials: "include",
        headers: CSRF_HEADERS,
        body: JSON.stringify(body),
      });
      const data: InspectResult = await res.json();
      if (!res.ok || !data.success) { setErr(data.error || "Import failed"); return; }
      setMsg(`Imported ${data.imported} items into version ${data.version?.name || ""}`);
      setPreview(null); setExcelB64(""); setCsvText(""); setFileName("");
      await loadVersions();
    } finally { setBusy(false); }
  }

  async function activateVersion(id: string) {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/tariffs", {
        method: "PATCH", credentials: "include",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ id, action: "activate" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setErr(data.error || "Activate failed"); return; }
      setMsg("Tariff version activated");
      await loadVersions();
    } finally { setBusy(false); }
  }

  if (authLoading) {
    return <AppShell><p className="text-sm text-gray-500">Loading…</p></AppShell>;
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tariff import</h1>
          <p className="mt-1 text-sm text-gray-600">
            Upload hospital Excel/CSV tariffs, map columns, validate, and create an immutable version.
            Historical invoices keep snapshotted rates.
          </p>
        </div>
        {msg && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</div>}
        {err && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">1. Upload workbook</h2>
          <input type="file" accept=".xlsx,.xls,.csv,text/csv" className="mt-2 block w-full text-sm"
            onChange={(e) => onFile(e.target.files?.[0] || null)} disabled={busy} />
          {fileName && <p className="mt-1 text-xs text-gray-500">{fileName}</p>}
          {sheets.length > 0 && (
            <label className="mt-3 block text-xs font-medium text-gray-700">
              Sheet
              <select className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                value={sheetName} onChange={(e) => changeSheet(e.target.value)} disabled={busy}>
                {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
        </section>

        {headers.length > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">2. Column mapping</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {MAP_FIELDS.map((f) => (
                <label key={f.key} className="block text-xs font-medium text-gray-700">
                  {f.label}
                  <select className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    value={mapping[f.key] || ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                    <option value="">— not mapped —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <button type="button" onClick={runPreview} disabled={busy}
              className="mt-4 rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              Validate / preview
            </button>
            {preview && preview.validCount != null && (
              <div className="mt-3 text-sm text-gray-700">
                Valid rows: <strong>{preview.validCount}</strong> · Errors: <strong>{preview.errorCount}</strong>
              </div>
            )}
          </section>
        )}

        {preview && (preview.validCount ?? 0) > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">3. Confirm import</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-gray-700">
                Tariff name
                <input className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  value={tariffName} onChange={(e) => setTariffName(e.target.value)} />
              </label>
              <label className="block text-xs font-medium text-gray-700">
                Version label
                <input className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  value={tariffVersion} onChange={(e) => setTariffVersion(e.target.value)} />
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
              Activate this version after import (supersedes current active)
            </label>
            <button type="button" onClick={commitImport} disabled={busy}
              className="mt-4 rounded-md bg-[#c2183a] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "Importing…" : "Create tariff version"}
            </button>
          </section>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Tariff versions</h2>
          {versions.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No tariff versions yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {v.name} <span className="text-gray-500">({v.version})</span>
                      {v.isActive && (
                        <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-800">ACTIVE</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {v._count?.items ?? "?"} items · {v.sourceFile || "manual"} · {new Date(v.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                  {!v.isActive && (
                    <button type="button" disabled={busy} onClick={() => activateVersion(v.id)}
                      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      Activate
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
