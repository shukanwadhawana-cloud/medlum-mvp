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
    setLaunching(id);
    setError("");
    try {
      const res = await fetch(`/api/imaging-studies?id=${encodeURIComponent(id)}&launch=1`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Viewer unavailable");
        return;
      }
      if (data.viewerUrl) window.open(String(data.viewerUrl), "_blank", "noopener,noreferrer");
      else setError("Viewer URL not available");
    } catch {
      setError("Failed to open viewer");
    } finally {
      setLaunching(null);
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
      {error ? <p className="mt-2 text-[11px] text-red-700">{error}</p> : null}
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
                {launching === s.id ? "Opening…" : s.status !== "AVAILABLE" ? "Awaiting PACS verification" : "Open in viewer"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
