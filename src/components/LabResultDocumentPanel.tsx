"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { runClinicalAssistOcr } from "@/lib/clinical-assist-ocr";

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

function rawTextFrom(doc?: Doc | null): string {
  if (!doc?.ocrDraft) return "";
  try { return String(JSON.parse(doc.ocrDraft).rawTextPreview || ""); } catch { return ""; }
}

async function preprocessClinicalAssistImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 2400;
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) { bitmap.close(); throw new Error("Canvas is unavailable on this device."); }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Match Clinical Assist's clean pass: grayscale + high-quality resize.
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
  }
  ctx.putImageData(image, 0, 0);

  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not prepare the report photo.")), "image/png", 1)
  );
  if (png.size <= 8 * 1024 * 1024) return new File([png], "medlum-scan.png", { type: "image/png" });

  // Large camera photos are downsized/compressed using Clinical Assist's fallback.
  const maxDimension = 1600;
  const compressScale = Math.min(1, maxDimension / Math.max(canvas.width, canvas.height));
  const compressedCanvas = document.createElement("canvas");
  compressedCanvas.width = Math.max(1, Math.round(canvas.width * compressScale));
  compressedCanvas.height = Math.max(1, Math.round(canvas.height * compressScale));
  const compressedContext = compressedCanvas.getContext("2d");
  if (!compressedContext) throw new Error("Could not compress the report photo.");
  compressedContext.drawImage(canvas, 0, 0, compressedCanvas.width, compressedCanvas.height);
  const compressed = await new Promise<Blob>((resolve, reject) =>
    compressedCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not compress the report photo.")), "image/jpeg", 0.86)
  );
  return new File([compressed], "medlum-scan.jpg", { type: "image/jpeg" });
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
  const [retrying, setRetrying] = useState(false);
  const [manualResult, setManualResult] = useState("");
  const [clinicalAssistBusy, setClinicalAssistBusy] = useState(false);
  const [clinicalAssistStatus, setClinicalAssistStatus] = useState("");
  const clinicalAssistInputRef = useRef<HTMLInputElement | null>(null);

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
        // Restore retained OCR text after reopening a failed report; otherwise the
        // manual-review box can appear empty even when extraction saved a text preview.
        if (latest.ocrStatus === "FAILED") setManualResult(rawTextFrom(latest));
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
      setManualResult(String(data.document?.ocrDraft || "").includes("rawTextPreview")
        ? (() => {
            try { return String(JSON.parse(data.document.ocrDraft).rawTextPreview || ""); } catch { return ""; }
          })()
        : "");
      setMessage(
        data.retried
          ? data.ocr?.status === "DRAFT"
            ? "This report already existed. Extraction was retried and a draft is ready for clinician review."
            : "This report already existed. The retry did not produce a structured draft; review the retained text or enter the result manually."
          : data.deduplicated
            ? "Report already exists. Its current extraction status and draft have been loaded."
            : data.ocr?.status === "DRAFT"
              ? "Report uploaded. OCR draft is ready for human verification."
              : "Report uploaded, but OCR did not produce a usable structured draft. Review retained text or enter the result manually; no clinical result was written."
      );
      setPhase("ready");
      await load();
    } catch (e: any) {
      setPhase("failed");
      setError(e?.message || "Upload failed");
    }
  }

  async function retryExtraction() {
    if (!selectedDoc || retrying || verifying) return;
    setRetrying(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/labs/documents/${selectedDoc.id}/retry`, {
        method: "POST",
        credentials: "include",
        headers: { "X-MedLum-Requested-With": "MedLum" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Could not retry extraction");
      const doc = data.document as Doc;
      setSelectedDoc(doc);
      setValues(candidatesFrom(doc));
      let rawText = "";
      try { rawText = String(JSON.parse(doc.ocrDraft || "{}").rawTextPreview || ""); } catch { /* keep empty */ }
      setManualResult(rawText);
      setMessage(data.ocr?.status === "DRAFT"
        ? "Extraction retry succeeded. Review every value before accepting or correcting it."
        : "Extraction retry finished, but no structured draft was produced. You can re-upload the same report or enter/correct the result manually.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not retry extraction");
    } finally {
      setRetrying(false);
    }
  }

  async function runClinicalAssistFromSavedDocument() {
    if (!selectedDoc || clinicalAssistBusy || verifying || retrying) return;
    setClinicalAssistBusy(true);
    setClinicalAssistStatus("Loading the saved report for on-device Clinical Assist…");
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/labs/documents/${selectedDoc.id}/view?raw=1`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("The stored original is not available for browser extraction. Use “Choose report file instead” to select the original PDF/photo.");
      }
      const blob = await response.blob();
      const file = new File([blob], selectedDoc.originalFileName, {
        type: selectedDoc.mimeType || blob.type || "application/octet-stream",
      });
      // runClinicalAssist owns the OCR state and keeps the output as a draft.
      await runClinicalAssist(file);
    } catch (e: any) {
      setError(e?.message || "Could not read the saved report for Clinical Assist");
      setClinicalAssistStatus("");
    } finally {
      setClinicalAssistBusy(false);
    }
  }

  async function runClinicalAssist(file: File) {
    if (!selectedDoc) {
      setError("Upload and select a saved lab report before running Clinical Assist.");
      return;
    }
    setClinicalAssistBusy(true);
    setClinicalAssistStatus("Preparing document for on-device Clinical Assist…");
    setError("");
    setMessage("");
    try {
      // Match Clinical Assist's supported inputs, size limit and image preprocessing.
      if (file.size <= 0) throw new Error("The selected document is empty.");
      if (file.size > 8 * 1024 * 1024) throw new Error("Document is larger than 8 MB. Choose a smaller PDF or image.");
      const lowerName = file.name.toLowerCase();
      const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
      const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(lowerName);
      if (!isPdf && !isImage) throw new Error("Unsupported document type. Upload a PDF, JPG, PNG, or WebP image.");
      if (/\.heic$|\.heif$/i.test(lowerName) || file.type === "image/heic" || file.type === "image/heif") {
        throw new Error("HEIC/HEIF is not supported yet. Export or retake the photo as JPG/PNG, or upload a PDF.");
      }
      // Fingerprint the original input before preprocessing. The server must confirm
      // this is the exact binary already attached to the selected MedicalDocument.
      const sourceBuffer = await file.arrayBuffer();
      const sourceDigest = await crypto.subtle.digest("SHA-256", sourceBuffer);
      const sourceChecksum = Array.from(new Uint8Array(sourceDigest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const ocrFile = isImage ? await preprocessClinicalAssistImage(file) : file;
      // Use the same on-device OCR engine as the Clinical Assist page.
      // Only the extracted text is submitted; it remains an unverified draft.
      const scan = await runClinicalAssistOcr(ocrFile, (status) => setClinicalAssistStatus(status));
      const rawText = scan.text.trim();
      if (rawText.length < 20) {
        throw new Error("Clinical Assist found too little readable text. Try a clearer, upright photo or a higher-quality PDF.");
      }
      setManualResult(rawText);
      setClinicalAssistStatus("Saving extracted text as an unverified draft…");
      const res = await fetch(`/api/labs/documents/${selectedDoc.id}/clinical-assist`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-MedLum-Requested-With": "MedLum",
        },
        body: JSON.stringify({
          rawText,
          sourceChecksum,
          method: scan.label,
          confidence: scan.confidence,
          partial: Boolean(scan.partial),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Could not save Clinical Assist draft");
      const doc = data.document as Doc;
      setSelectedDoc(doc);
      setValues(candidatesFrom(doc));
      setManualResult(rawTextFrom(doc) || rawText);
      setClinicalAssistStatus(
        scan.label + (scan.confidence == null ? "" : " · OCR confidence " + Math.round(scan.confidence) + "%") +
        (scan.partial ? " · only the supported first PDF pages were processed" : "")
      );
      setMessage(data.ocr?.status === "DRAFT"
        ? "Clinical Assist extracted " + (data.ocr?.candidateCount || 0) + " candidate lab values. Review each value against the source report before verifying."
        : "Clinical Assist extracted text but could not map supported lab values. The text is available for manual review; no clinical result has been written.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Clinical Assist extraction failed");
      setClinicalAssistStatus("");
    } finally {
      setClinicalAssistBusy(false);
    }
  }

  async function verify(action: "ACCEPT" | "CORRECT" | "REJECT" | "MANUAL") {
    if (!selectedDoc) return;
    setVerifying(true);
    setError("");
    setMessage("");
    try {
      const body: Record<string, unknown> = { action };
      if (action === "CORRECT") body.values = values;
      if (action === "REJECT") body.reason = "Rejected during clinical verification";
      if (action === "MANUAL") body.resultText = manualResult.trim();
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
  const canManualVerify = selectedStatus === "FAILED" && !verifying && manualResult.trim().length > 0;

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
            <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-[11px] font-semibold text-amber-900">
                Automatic OCR could not structure this report
              </p>
              <p className="text-[10px] text-amber-800">
                Extraction failed. Retry against the stored original, or re-upload the same report if the original is unavailable. Review and correct all extracted text before verification; nothing becomes a clinical result until you verify it.
              </p>
              <button
                type="button"
                disabled={verifying || retrying}
                onClick={() => void retryExtraction()}
                className="w-full rounded-lg border border-amber-300 bg-white px-2 py-2 text-[11px] font-semibold text-amber-900 disabled:opacity-50"
              >
                {retrying ? "Retrying extraction…" : "Retry report extraction"}
              </button>
              <input
                ref={clinicalAssistInputRef}
                type="file"
                accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                className="sr-only"
                disabled={clinicalAssistBusy || verifying}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) void runClinicalAssist(file);
                  e.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                disabled={clinicalAssistBusy || verifying || retrying}
                onClick={() => void runClinicalAssistFromSavedDocument()}
                className="w-full rounded-lg bg-[#4a0f20] px-2 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {clinicalAssistBusy ? "Running Clinical Assist…" : "Run Clinical Assist on saved report"}
              </button>
              <button
                type="button"
                disabled={clinicalAssistBusy || verifying || retrying}
                onClick={() => clinicalAssistInputRef.current?.click()}
                className="w-full rounded-lg border border-amber-300 bg-white px-2 py-2 text-[11px] font-semibold text-amber-900 disabled:opacity-50"
              >
                Choose report file instead
              </button>
              <p className="text-[10px] text-amber-800">
                MedLum first tries to read the saved original. If it is no longer available, choose the same PDF/photo. Clinical Assist processes the file in this browser; extracted values remain an unverified draft until you verify.
              </p>
              {clinicalAssistStatus && <p className="text-[10px] text-amber-900" role="status">{clinicalAssistStatus}</p>}
              <div>
                <p className="text-[10px] font-semibold text-gray-700">Retained OCR text / clinical findings</p>
                <textarea
                  value={manualResult}
                  onChange={(e) => setManualResult(e.target.value)}
                  disabled={verifying}
                  placeholder="Type or paste the laboratory findings from the report. Verify to save as the clinical result."
                  className="mt-1 min-h-28 w-full rounded border bg-white px-2 py-1.5 text-xs"
                />
              </div>
              <p className="text-[10px] text-gray-600">
                Review the source report and correct the text below if needed, then verify it as the clinical result.
              </p>
              <button
                type="button"
                disabled={!canManualVerify}
                onClick={() => void verify("MANUAL")}
                className="w-full rounded-lg bg-[#c2183a] px-2 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {verifying ? "Verifying…" : "Enter / Correct Result & Verify"}
              </button>
              <button
                type="button"
                disabled={verifying}
                onClick={() => void verify("REJECT")}
                className="w-full rounded-lg border border-red-200 bg-white px-2 py-2 text-[11px] font-medium text-red-700 disabled:opacity-50"
              >
                Reject report
              </button>
            </div>
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
