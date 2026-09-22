"use client";

import { useEffect, useState } from "react";

type Doc = {
  id: string;
  originalFileName: string;
  ocrStatus: string;
  mimeType?: string;
  sizeBytes?: number;
};

type UploadPhase =
  | "idle"
  | "selected"
  | "uploading"
  | "uploaded"
  | "failed"
  | "ocr"
  | "ready";

type Props = {
  labOrderId: string;
  patientId: string;
  onOcrCandidates?: (draft: Record<string, string>) => void;
};

function formatBytes(n?: number) {
  if (n == null || !Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LabResultDocumentPanel({ labOrderId, patientId, onOcrCandidates }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [selectedName, setSelectedName] = useState("");
  const [selectedMeta, setSelectedMeta] = useState("");
  const [lastFile, setLastFile] = useState<File | null>(null);
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
    setLastFile(file);
    setSelectedName(file.name);
    setSelectedMeta([file.type || "file", formatBytes(file.size)].filter(Boolean).join(" · "));
    setPhase("selected");
    setError("");
    setMessage("");
    // Reflect backend progress only — no fake completion
    setPhase("uploading");
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
      setPhase("uploaded");
      setMessage(
        data.deduplicated ? "Document already on file (deduplicated)." : "Document uploaded."
      );
      await load();
      setPhase("ready");
    } catch (e: any) {
      setPhase("failed");
      setError(e.message || "Upload failed");
    }
  }

  async function runOcr(docId: string) {
    setOcrRunning(true);
    setPhase("ocr");
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
      setMessage(data.message || `OCR ${data.ocrStatus} — review draft before finalizing`);
      if (data.draft && typeof data.draft === "object" && onOcrCandidates) {
        onOcrCandidates(data.draft);
      }
      await load();
      setPhase("ready");
    } catch (e: any) {
      setError(e.message || "OCR failed");
      setPhase("ready");
    } finally {
      setOcrRunning(false);
    }
  }

  const phaseLabel: Record<UploadPhase, string> = {
    idle: "Select a file",
    selected: "File selected",
    uploading: "Uploading…",
    uploaded: "Uploaded",
    failed: "Upload failed",
    ocr: "Processing / OCR…",
    ready: "Available",
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Report document</p>

      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
        disabled={phase === "uploading" || phase === "ocr"}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
        className="block w-full text-xs"
      />

      {phase !== "idle" && (
        <div className="rounded-md border bg-white px-2 py-1.5 text-xs">
          <p className="font-medium text-gray-800">{phaseLabel[phase]}</p>
          {selectedName && (
            <p className="mt-0.5 text-gray-600">
              {selectedName}
              {selectedMeta ? ` · ${selectedMeta}` : ""}
            </p>
          )}
        </div>
      )}

      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {error && (
        <div className="space-y-1">
          <p className="text-xs text-red-600">{error}</p>
          {phase === "failed" && lastFile && (
            <button
              type="button"
              onClick={() => void upload(lastFile)}
              className="rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700"
            >
              Retry upload
            </button>
          )}
        </div>
      )}

      {docs.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
          <a
            href={`/api/labs/documents/${d.id}/view`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#c2183a] underline"
          >
            View original: {d.originalFileName}
          </a>
          <span className="rounded border bg-white px-1.5 py-0.5 text-gray-600">{d.ocrStatus}</span>
          {d.sizeBytes != null && <span className="text-gray-400">{formatBytes(d.sizeBytes)}</span>}
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
        OCR produces a draft only. Verify before saving final results. Access is authenticated and
        tenant-scoped.
      </p>
    </div>
  );
}
