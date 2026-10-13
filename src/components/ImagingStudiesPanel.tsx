"use client";

import { useCallback, useEffect, useState } from "react";

type ImagingStudy = {
  id: string;
  modality: string;
  description: string;
  studyDate?: string | null;
  status: string;
  studyInstanceUid: string;
};

type Props = { patientId?: string; diagnosticOrderId?: string };

export default function ImagingStudiesPanel({ patientId, diagnosticOrderId }: Props) {
  const [studies, setStudies] = useState<ImagingStudy[]>([]);
  const [pacs, setPacs] = useState<{ enabled: boolean; configured: boolean }>({
    enabled: false,
    configured: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [launching, setLaunching] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dicomFile, setDicomFile] = useState<File | null>(null);
  const [importNotice, setImportNotice] = useState<{ kind: "success" | "warning"; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      if (patientId) q.set("patientId", patientId);
      if (diagnosticOrderId) q.set("diagnosticOrderId", diagnosticOrderId);
      const res = await fetch(`/api/imaging-studies?${q}`, { credentials: "include" });
      if (!res.ok) {
        setError(res.status === 403 ? "Not permitted" : "Could not load imaging studies");
        setStudies([]);
        return;
      }
      const data = await res.json();
      setStudies(Array.isArray(data.studies) ? data.studies : []);
      setPacs(data.pacs || { enabled: false, configured: false });
    } catch {
      setError("Could not load imaging studies");
    } finally {
      setLoading(false);
    }
  }, [patientId, diagnosticOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openViewer(id: string) {
    // Open the tab synchronously inside the tap handler so iOS Safari does not
    // treat it as a popup after the asynchronous authorization request.
    const viewerTab = window.open("about:blank", "_blank");
    if (!viewerTab) {
      setError("Your browser blocked the new tab. Allow pop-ups for MedLum and try again.");
      return;
    }
    // The new tab needs no access to the MedLum window.
    viewerTab.opener = null;
    viewerTab.document.title = "MedLum PACS";
    viewerTab.document.body.innerHTML =
      '<main style="font:16px system-ui;padding:24px;color:#334155">Checking access to this imaging study…</main>';

    setLaunching(id);
    setError("");
    try {
      const res = await fetch(`/api/imaging-studies?id=${encodeURIComponent(id)}&launch=1`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        viewerTab.close();
        setError(data.error || "Viewer unavailable");
        return;
      }
      if (typeof data.viewerUrl !== "string" || !data.viewerUrl) {
        viewerTab.close();
        setError("Viewer URL not available");
        return;
      }

      const target = new URL(data.viewerUrl, window.location.origin);
      if (target.protocol !== "https:" && target.origin !== window.location.origin) {
        viewerTab.close();
        setError("The configured PACS viewer must use HTTPS.");
        return;
      }
      viewerTab.location.replace(target.toString());
    } catch {
      viewerTab.close();
      setError("Failed to open viewer");
    } finally {
      setLaunching(null);
    }
  }

  async function importStudy() {
    if (!patientId || !diagnosticOrderId) {
      setError("Open PACS from a specific patient's diagnostic order to link an imported study safely.");
      return;
    }
    if (!dicomFile) {
      setError("Choose a DICOM file first.");
      return;
    }
    setImporting(true);
    setError("");
    setImportNotice(null);
    try {
      const body = new FormData();
      body.set("file", dicomFile);
      body.set("patientId", patientId);
      body.set("diagnosticOrderId", diagnosticOrderId);
      const res = await fetch("/api/imaging-studies/import", {
        method: "POST",
        credentials: "include",
        body,
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "DICOM import failed");
        return;
      }
      setDicomFile(null);
      const picker = document.getElementById("medlum-pacs-dicom-file") as HTMLInputElement | null;
      if (picker) picker.value = "";
      await load();
      setError("");
      if (data.identityMode === "matched") {
        setImportNotice({
          kind: "success",
          message: "DICOM PatientID matched the patient's MedLum UHID or registration number.",
        });
      } else {
        setImportNotice({
          kind: "warning",
          message:
            "Patient identity could not be confirmed from the DICOM PatientID. This study was linked to the selected patient/order; confirm the patient and order before clinical use.",
        });
      }
    } catch {
      setError("DICOM import failed. Check the PACS connection and try again.");
    } finally {
      setImporting(false);
    }
  }

  async function verifyStudy(id: string) {
    setVerifying(id);
    setError("");
    try {
      const res = await fetch("/api/imaging-studies/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Verification failed");
        return;
      }
      await load();
    } catch {
      setError("Verification request failed");
    } finally {
      setVerifying(null);
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Imaging studies (PACS)</h3>
        <button type="button" onClick={() => void load()} className="rounded-md border px-2 py-1 text-[11px] font-medium">
          Refresh
        </button>
      </div>
      {!pacs.enabled && (
        <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1">
          External PACS is not configured. Viewing requires Orthanc + OHIF (docs/PACS_INTEGRATION.md).
        </p>
      )}
      {error ? <p role="alert" className="mt-2 text-[11px] text-red-700">{error}</p> : null}
      {importNotice ? (
        <p
          role={importNotice.kind === "warning" ? "alert" : "status"}
          className={
            importNotice.kind === "warning"
              ? "mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-900"
              : "mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-2 text-[11px] text-emerald-900"
          }
        >
          {importNotice.message}
        </p>
      ) : null}
      {pacs.enabled && patientId && diagnosticOrderId ? (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2">
          <p className="text-[12px] font-semibold text-gray-900">Import DICOM study</p>
          <p className="mt-1 text-[10px] text-gray-600">Choose a DICOM instance for this patient and diagnostic order. The server verifies the study and patient identity before linking it.</p>
          <input
            id="medlum-pacs-dicom-file"
            type="file"
            accept=".dcm,application/dicom,application/octet-stream"
            onChange={(event) => setDicomFile(event.target.files?.[0] || null)}
            className="mt-2 block w-full text-[11px] text-gray-700"
          />
          <button
            type="button"
            disabled={!dicomFile || importing}
            onClick={() => void importStudy()}
            className="mt-2 rounded-md bg-[#c2183a] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {importing ? "Importing and verifying…" : "Import and link DICOM"}
          </button>
        </div>
      ) : null}

      {loading ? <p className="mt-2 text-[11px] text-gray-500">Loading…</p> : null}
      {!loading && studies.length === 0 && !error ? (
        <p className="mt-2 text-[11px] text-gray-500">No imaging studies linked for this selection.</p>
      ) : null}
      <ul className="mt-2 space-y-2">
        {studies.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-2 py-2">
            <div>
              <p className="text-[12px] font-medium text-gray-900">
                {s.modality || "OT"}
                {s.description ? ` · ${s.description}` : ""}
              </p>
              <p className="text-[10px] text-gray-500">Status: {s.status}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {s.status !== "AVAILABLE" && (
                <button
                  type="button"
                  disabled={!pacs.enabled || verifying === s.id}
                  onClick={() => void verifyStudy(s.id)}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                >
                  {verifying === s.id ? "Verifying…" : "Verify in PACS"}
                </button>
              )}
              <button
                type="button"
                disabled={!pacs.configured || s.status !== "AVAILABLE" || launching === s.id}
                onClick={() => void openViewer(s.id)}
                className="rounded-md bg-[#c2183a] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {launching === s.id ? "Opening…" : s.status !== "AVAILABLE" ? "Awaiting PACS verification" : "Open PACS in new tab"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
