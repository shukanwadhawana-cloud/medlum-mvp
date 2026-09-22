"use client";

import { useEffect, useState } from "react";

type Doc = { id: string; originalFileName: string; ocrStatus: string };

type Props = {
  labOrderId: string;
  patientId: string;
  onOcrCandidates?: (draft: Record<string, string>) => void;
};

export default function LabResultDocumentPanel({ labOrderId, patientId, onOcrCandidates }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch(`/api/labs/documents?labOrderId=${encodeURIComponent(labOrderId)}`, {
        credentials: "include",
      });
      const data = await res.json();
      setDocs(data.documents || []);
    } catch {
      setDocs([]);
    }
  }

  useEffect(() => {
    void load();
  }, [labOrderId]);

  async function upload(file: File) {
    setUploading(true);
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
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
      setMessage(data.deduplicated ? "Document already on file (deduplicated)." : "Document uploaded.");
      await load();
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function runOcr(docId: string) {
    setOcrRunning(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/labs/documents/${docId}/ocr`, {
        method: "POST",
        credentials: "include",
        headers: { "X-MedLum-Requested-With": "MedLum" },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "OCR failed");
      setMessage(data.message || `OCR ${data.ocrStatus}`);
      if (data.draft && typeof data.draft === "object" && onOcrCandidates) {
        onOcrCandidates(data.draft);
      }
      await load();
    } catch (e: any) {
      setError(e.message || "OCR failed");
    } finally {
      setOcrRunning(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Report document</p>
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
        className="block w-full text-xs"
      />
      {uploading && <p className="text-xs text-gray-500">Uploading…</p>}
      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {docs.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
          <a
            href={`/api/labs/documents/${d.id}/view`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#c2183a] underline"
          >
            {d.originalFileName}
          </a>
          <span className="text-gray-400">{d.ocrStatus}</span>
          <button
            type="button"
            disabled={ocrRunning}
            onClick={() => void runOcr(d.id)}
            className="rounded border px-2 py-1 text-[11px]"
          >
            {ocrRunning ? "OCR…" : "OCR draft"}
          </button>
        </div>
      ))}
      <p className="text-[10px] text-gray-400">
        OCR produces a draft only. Verify before saving final results. Binaries are not stored in the database.
      </p>
    </div>
  );
}
