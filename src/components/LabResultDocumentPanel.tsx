"use client";

import { useEffect, useMemo, useState } from "react";
import { prepareClinicalAssistImage, runClinicalAssistOcr } from "@/lib/clinical-assist-ocr";

type Doc = {
  id: string;
  originalFileName: string;
  ocrStatus: string;
  mimeType?: string;
  sizeBytes?: number;
  checksum?: string;
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

function rawTextFrom(doc?: Doc | null): string {
  if (!doc?.ocrDraft) return "";
  try { return String(JSON.parse(doc.ocrDraft).rawTextPreview || ""); } catch { return ""; }
}

function warningsFrom(doc?: Doc | null): string[] {
  if (!doc?.ocrDraft) return [];
  try {
    const warnings = JSON.parse(doc.ocrDraft).warnings;
    return Array.isArray(warnings) ? warnings.filter((item: unknown): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function sha256Hex(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot securely validate the selected report. Use a current browser over HTTPS.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
  const [clinicalAssistRunning, setClinicalAssistRunning] = useState(false);
  const [clinicalAssistProgress, setClinicalAssistProgress] = useState("");
  const [assistSourceFile, setAssistSourceFile] = useState<File | null>(null);
  const [manualResult, setManualResult] = useState("");

  async function load(preferredDocumentId?: string) {
    try {
      const res = await fetch(`/api/labs/documents?labOrderId=${encodeURIComponent(labOrderId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      const next = (data.documents || []) as Doc[];
      setDocs(next);
      // Keep the selected document stable. In particular, retrying an older
      // checksum-deduplicated report must not silently switch to the newest row.
      const wantedId = preferredDocumentId || selectedDoc?.id;
      const chosen = next.find((item) => item.id === wantedId) || next[0];
      if (chosen) {
        const rawText = rawTextFrom(chosen);
        if (selectedDoc?.id !== chosen.id) setManualResult(rawText);
        else setManualResult((current) => current.trim() ? current : rawText);
        setSelectedDoc(chosen);
        setValues(candidatesFrom(chosen));
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
    if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
      setPhase("failed");
      setError("Choose a non-empty PDF, JPG, or PNG up to 8 MB. Larger files cannot be processed reliably by on-device Clinical Assist.");
      return;
    }
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
      if (!res.ok || !data.success) throw new Error(data.error || `Upload failed (HTTP ${res.status}).`);

      const doc = data.document as Doc;
      setSelectedDoc(doc);
      // Retain the exact bytes for immediate browser OCR and checksum binding.
      // The server has already stored the same original durably before returning.
      setAssistSourceFile(file);
      setValues(candidatesFrom(doc));
      setManualResult(rawTextFrom(doc));
      setPhase("ready");
      setMessage(
        data.deduplicated
          ? data.needsClientExtraction
            ? "This report already existed. Its original file is available; Clinical Assist is retrying extraction without creating a duplicate."
            : "Report already exists. Its current extraction and verification state has been loaded."
          : "Report uploaded and stored. Clinical Assist is now extracting an editable draft on this device."
      );
      await load(doc.id);

      // OCR does not run inside the upload API anymore. This prevents native
      // WASM initialization failures and 300-second serverless timeouts from
      // turning a successful file upload into an apparent upload failure.
      if (data.needsClientExtraction || ["PENDING", "FAILED"].includes(String(doc.ocrStatus))) {
        await extractWithClinicalAssist(file, doc);
      }
    } catch (e: any) {
      setPhase("failed");
      setError(e?.message || "Upload failed. The original report was not confirmed as saved.");
    }
  }

  async function retryExtraction() {
    if (!selectedDoc || retrying || verifying || clinicalAssistRunning) return;
    setRetrying(true);
    setError("");
    setMessage("");
    try {
      // Always retry in the browser; server-side Tesseract has been timing out
      // on Vercel and is not part of the upload request anymore.
      await extractWithClinicalAssist(assistSourceFile || undefined, selectedDoc, true);
    } finally {
      setRetrying(false);
    }
  }

  async function extractWithClinicalAssist(chosenFile?: File, documentOverride?: Doc, allowWhileRetrying = false) {
    const targetDoc = documentOverride || selectedDoc;
    if (!targetDoc || clinicalAssistRunning || verifying || (retrying && !allowWhileRetrying)) return;
    setClinicalAssistRunning(true);
    setClinicalAssistProgress("Loading and validating the original report…");
    setError("");
    setMessage("");
    try {
      let originalFile = chosenFile || assistSourceFile;
      if (!originalFile) {
        const source = await fetch(`/api/labs/documents/${targetDoc.id}/view?raw=1`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!source.ok) {
          throw new Error("The saved report bytes are unavailable. Choose the exact original report file; MedLum will validate its checksum before extraction.");
        }
        const blob = await source.blob();
        originalFile = new File(
          [blob],
          targetDoc.originalFileName || "lab-report",
          { type: targetDoc.mimeType || blob.type || "application/octet-stream" }
        );
      }

      if (originalFile.size <= 0 || originalFile.size > 8 * 1024 * 1024) {
        throw new Error("Clinical Assist supports report files up to 8 MB. Choose a smaller PDF or image.");
      }
      // Prevent text from another report being associated with this patient's lab order.
      if (!targetDoc.checksum) {
        throw new Error("The saved document checksum is unavailable. Reload the lab panel before attempting extraction.");
      }
      const suppliedChecksum = await sha256Hex(originalFile);
      if (suppliedChecksum.toLowerCase() !== targetDoc.checksum.toLowerCase()) {
        throw new Error("This file does not exactly match the saved report. Select the original file that was uploaded for this lab order.");
      }
      setAssistSourceFile(originalFile);

      let ocrFile = originalFile;
      if (originalFile.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(originalFile.name)) {
        setClinicalAssistProgress("Preparing the report image for OCR…");
        ocrFile = await prepareClinicalAssistImage(originalFile);
      }
      const scan = await runClinicalAssistOcr(ocrFile, (progress) => setClinicalAssistProgress(progress));
      const text = scan.text.trim();
      if (text.length < 20) {
        throw new Error("Clinical Assist found too little readable text. Try a clearer, upright image or a higher-quality PDF.");
      }

      setClinicalAssistProgress("Structuring candidate lab values…");
      const res = await fetch(`/api/labs/documents/${targetDoc.id}/clinical-assist`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-MedLum-Requested-With": "MedLum",
        },
        body: JSON.stringify({ text, sourceChecksum: suppliedChecksum, label: scan.label, confidence: scan.confidence, partial: scan.partial === true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Clinical Assist could not save its draft.");
      const doc = data.document as Doc;
      setSelectedDoc(doc);
      setValues(candidatesFrom(doc));
      setManualResult(rawTextFrom(doc));
      setMessage(data.ocr?.message || "Clinical Assist finished. Review every value against the original report.");
      setClinicalAssistProgress("");
      await load(doc.id);
    } catch (e: any) {
      setError(e?.message || "Clinical Assist extraction failed. The report remains saved; retry extraction or enter the result manually.");
      setClinicalAssistProgress("");
    } finally {
      setClinicalAssistRunning(false);
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
        disabled={phase === "uploading" || verifying || retrying || clinicalAssistRunning}
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
              {warningsFrom(selectedDoc).length > 0 && (
                <ul className="list-disc pl-4 space-y-1 text-[10px] text-amber-900">
                  {warningsFrom(selectedDoc).map((warning, index) => <li key={index}>{warning}</li>)}
                </ul>
              )}
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
              {rawTextFrom(selectedDoc) && (
                <details className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                  <summary className="cursor-pointer text-[10px] font-semibold text-gray-700">View full OCR text</summary>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[10px] text-gray-700">{rawTextFrom(selectedDoc)}</pre>
                </details>
              )}
            </div>
          )}

          {selectedStatus === "FAILED" && (
            <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="rounded-lg border border-emerald-200 bg-white p-3 space-y-2">
                <p className="text-[11px] font-semibold text-emerald-900">Extract with Clinical Assist on this device</p>
                <p className="text-[10px] text-gray-600">
                  Re-read this exact report with on-device OCR. Machine-extracted values remain drafts until a clinician verifies them.
                </p>
                <button
                  type="button"
                  disabled={clinicalAssistRunning || retrying || verifying}
                  onClick={() => void extractWithClinicalAssist()}
                  className="w-full rounded-lg bg-emerald-800 px-2 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  {clinicalAssistRunning ? "Running Clinical Assist…" : "Extract with Clinical Assist"}
                </button>
                <label className="block cursor-pointer rounded-lg border border-emerald-300 bg-white px-2 py-2 text-center text-[11px] font-semibold text-emerald-900">
                  Choose the original report file
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                    className="sr-only"
                    disabled={clinicalAssistRunning || retrying || verifying}
                    onChange={(event) => {
                      const f = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (f) void extractWithClinicalAssist(f);
                    }}
                  />
                </label>
                <p className="text-[10px] text-gray-500">
                  This hosting mode may not retain original file bytes. Re-select the exact same file; MedLum checks its SHA-256 before extracting.
                </p>
                {clinicalAssistRunning && clinicalAssistProgress && (
                  <p className="text-[10px] text-emerald-800" role="status">{clinicalAssistProgress}</p>
                )}
              </div>
              <p className="text-[11px] font-semibold text-amber-900">
                Clinical Assist could not create a structured draft
              </p>
              <p className="text-[10px] text-amber-800">
                MedLum will retry the saved report using the enhanced Clinical Assist OCR path, including image preprocessing and alternate recognition settings. Extracted text stays a draft and must be checked against the original before verification.
              </p>
              {(() => {
                let diagnostic = "";
                let warnings: string[] = [];
                try {
                  const parsed = JSON.parse(selectedDoc.ocrDraft || "{}");
                  diagnostic = String(parsed.message || "");
                  warnings = Array.isArray(parsed.warnings) ? parsed.warnings.map(String).filter(Boolean) : [];
                } catch { /* legacy draft format */ }
                return (diagnostic || warnings.length > 0) ? (
                  <div className="rounded-md border border-amber-200 bg-white/70 p-2 text-[10px] text-amber-900">
                    {diagnostic && <p>{diagnostic}</p>}
                    {warnings.map((warning, index) => <p key={index} className="mt-1">{warning}</p>)}
                  </div>
                ) : null;
              })()}
              <button
                type="button"
                disabled={verifying || retrying || clinicalAssistRunning}
                onClick={() => void retryExtraction()}
                className="w-full rounded-lg border border-amber-300 bg-white px-2 py-2 text-[11px] font-semibold text-amber-900 disabled:opacity-50"
              >
                {retrying ? "Retrying extraction…" : "Retry Clinical Assist extraction"}
              </button>
              <div>
                <p className="text-[10px] font-semibold text-gray-700">Extracted text / clinical findings (editable draft)</p>
                <textarea
                  value={manualResult}
                  onChange={(e) => setManualResult(e.target.value)}
                  disabled={verifying || clinicalAssistRunning || retrying}
                  placeholder="Type or paste the laboratory findings from the report. Verify to save as the clinical result."
                  className="mt-1 min-h-28 w-full rounded border bg-white px-2 py-1.5 text-xs"
                />
              </div>
              <p className="text-[10px] text-gray-600">
                Review the source report and correct the text below if needed, then verify it as the clinical result.
              </p>
              <button
                type="button"
                disabled={!canManualVerify || clinicalAssistRunning || retrying}
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
