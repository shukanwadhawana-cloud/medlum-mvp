"use client";

import { useEffect, useMemo, useState } from "react";

type Doc = {
  id: string;
  originalFileName: string;
  ocrStatus: string;
  mimeType?: string;
  sizeBytes?: number;
  ocrDraft?: string | null;
  verifiedAt?: string | null;
};

type Props = {
  labOrderId: string;
  patientId: string;
  onVerified?: () => void | Promise<void>;
};

function formatBytes(n?: number) {
  if (n == null || !Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function candidatesFrom(doc?: Doc | null): Record<string, string> {
  if (!doc?.ocrDraft) return {};
  try {
    const parsed = JSON.parse(doc.ocrDraft);
    const c = parsed?.candidates;
    if (!c || typeof c !== "object" || Array.isArray(c)) return {};
    return Object.fromEntries(
      Object.entries(c).map(([k, v]) => [String(k), String(v ?? "")]).filter(([, v]) => v.trim())
    );
  } catch {
    return {};
  }
}

export default function LabResultDocumentPanel({ labOrderId, patientId, onVerified }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "uploading" | "ready" | "failed">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  async function load() {
    try {
      const res = await fetch(`/api/labs/documents?labOrderId=${encodeURIComponent(labOrderId)}`, {
        credentials: "include",
      });
      const data = await res.json();
      const next = (data.documents || []) as Doc[];
      setDocs(next);
      const latest = next[0];
      if (latest) {
        setSelectedDoc(latest);
        setValues(candidatesFrom(latest));
      }
    } catch {
      setDocs([]);
    }
  }

  useEffect(() => {
    void load();
  }, [labOrderId]);

  async function upload(file: File) {
    setPhase("uploading");
    setError("");
    setMessage("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("labOrderId", labOrderId);
      fd.append("patientId", patientId);
      const res = await fetch("/api/labs/documents", {
        method: "POST",
        credentials: "include",
        headers: { "X-MedLum-Requested-With": "MedLum" },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");

      const doc = data.document as Doc;
      setSelectedDoc(doc);
      const nextValues = candidatesFrom(doc);
      setValues(nextValues);
      setMessage(
        data.deduplicated
          ? "Report already exists. Review the OCR draft below."
          : data.ocr?.status === "DRAFT"
            ? "Report uploaded. OCR draft is ready for human verification."
            : "Report uploaded. OCR could not produce a draft; enter the result manually."
      );
      setPhase("ready");
      await load();
    } catch (e: any) {
      setPhase("failed");
      setError(e?.message || "Upload failed");
    }
  }

  async function verify(action: "ACCEPT" | "CORRECT" | "REJECT") {
    if (!selectedDoc) return;
    setVerifying(true);
    setError("");
    setMessage("");
    try {
      const body: Record<string, unknown> = { action };
      if (action === "CORRECT") body.values = values;
      if (action === "REJECT") body.reason = "Rejected during clinical verification";
      const res = await fetch(`/api/labs/documents/${selectedDoc.id}/verify`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-MedLum-Requested-With": "MedLum",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Verification failed");
      setMessage(
        action === "REJECT"
          ? "Report rejected. No clinical result was written."
          : "Report verified. The verified result has been written to the lab order."
      );
      await load();
      if (action !== "REJECT") await onVerified?.();
    } catch (e: any) {
      setError(e?.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  const candidateEntries = useMemo(() => Object.entries(values), [values]);
  const selectedStatus = selectedDoc?.ocrStatus || "NONE";
  const canVerify = selectedStatus === "DRAFT" && !verifying;

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
      <div>
        <p className="text-xs font-semibold text-gray-800">Upload lab report</p>
        <p className="mt-0.5 text-[10px] text-gray-500">
          PDF/JPG/PNG · OCR is a draft only · human verification is required before clinical result
        </p>
      </div>

      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
        disabled={phase === "uploading" || verifying}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
        className="block w-full rounded-lg border bg-white p-2 text-xs"
      />

      {phase === "uploading" && <p className="text-xs text-gray-600">Uploading and preparing OCR draft…</p>}
      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {selectedDoc && (
        <div className="rounded-lg border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold">{selectedDoc.originalFileName}</p>
              <p className="text-[10px] text-gray-500">
                {selectedDoc.mimeType || "file"}{selectedDoc.sizeBytes != null ? ` · ${formatBytes(selectedDoc.sizeBytes)}` : ""}
              </p>
            </div>
            <span className="rounded border bg-gray-50 px-2 py-1 text-[10px] font-medium">
              {selectedStatus}
            </span>
          </div>

          {candidateEntries.length > 0 && selectedStatus === "DRAFT" && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] font-semibold text-gray-700">OCR draft — verify each value</p>
              {candidateEntries.map(([key, value]) => (
                <label key={key} className="block">
                  <span className="text-[10px] text-gray-500">{key}</span>
                  <input
                    value={value}
                    onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="mt-0.5 min-h-9 w-full rounded border px-2 py-1.5 text-xs"
                    disabled={verifying}
                  />
                </label>
              ))}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={!canVerify}
                  onClick={() => void verify("ACCEPT")}
                  className="flex-1 rounded-lg bg-emerald-700 px-2 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  {verifying ? "Verifying…" : "Accept OCR"}
                </button>
                <button
                  type="button"
                  disabled={!canVerify}
                  onClick={() => void verify("CORRECT")}
                  className="flex-1 rounded-lg bg-[#c2183a] px-2 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  Correct & Verify
                </button>
              </div>
              <button
                type="button"
                disabled={!canVerify}
                onClick={() => void verify("REJECT")}
                className="w-full rounded-lg border border-red-200 bg-white px-2 py-2 text-[11px] font-medium text-red-700 disabled:opacity-50"
              >
                Reject report
              </button>
            </div>
          )}

          {selectedStatus === "FAILED" && (
            <p className="mt-2 text-[11px] text-amber-700">
              OCR did not produce a usable structured draft. The OCR diagnostic text is retained for investigation; no clinical result was written.
            </p>
          )}

          {selectedStatus === "VERIFIED" && (
            <p className="mt-2 text-[11px] text-emerald-700">
              Human verified. The clinical lab result was written from the verified values.
            </p>
          )}

          {selectedStatus === "REJECTED" && (
            <p className="mt-2 text-[11px] text-red-700">
              Rejected. This document did not write a clinical result.
            </p>
          )}
        </div>
      )}

      {docs.length > 1 && (
        <p className="text-[10px] text-gray-400">{docs.length} report documents linked to this lab order.</p>
      )}

      <p className="text-[10px] text-gray-400">
        The machine OCR draft is never treated as clinical truth until a permitted clinical/lab user verifies it.
      </p>
    </div>
  );
}
