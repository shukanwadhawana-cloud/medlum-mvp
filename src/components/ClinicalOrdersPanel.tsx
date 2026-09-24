"use client";

import { useState } from "react";
import Link from "next/link";
import { apiCreateLabOrder, apiCreateDiagnosticOrder } from "@/lib/api";
import { formatIst } from "@/lib/time";

const LAB_PRESETS = [
  "CBC",
  "LFT",
  "KFT",
  "Lipid Profile",
  "HbA1c",
  "TSH",
  "Urine Routine",
  "Blood Sugar",
  "CRP",
  "PT/INR",
];

const DX_PRESETS = [
  { studyName: "Chest X-ray", modality: "X-Ray", bodyPart: "Chest" },
  { studyName: "Ultrasound Abdomen", modality: "Ultrasound", bodyPart: "Abdomen" },
  { studyName: "CT Head", modality: "CT", bodyPart: "Head" },
  { studyName: "MRI Brain", modality: "MRI", bodyPart: "Brain" },
  { studyName: "2D Echo", modality: "Echo", bodyPart: "Heart" },
  { studyName: "ECG", modality: "ECG", bodyPart: "Heart" },
];

const LAB_ACTIVE = new Set([
  "Ordered",
  "Sample Pending",
  "Sample Collected",
  "Processing",
  "Result Available",
  "Awaiting Review",
  "PENDING",
  "ACTIVE",
]);

export function ClinicalOrdersPanel({
  patientId,
  labs,
  diagnostics,
  onSaved,
  focus = "all",
}: {
  patientId: string;
  labs: any[];
  diagnostics: any[];
  onSaved: () => Promise<void> | void;
  /** CPRS-style focused views */
  focus?: "all" | "lab" | "radiology";
}) {
  const showLab = focus === "all" || focus === "lab";
  const showDx = focus === "all" || focus === "radiology";
  const [labTest, setLabTest] = useState(LAB_PRESETS[0]);
  const [labCustom, setLabCustom] = useState("");
  const [labNotes, setLabNotes] = useState("");
  const [dxPreset, setDxPreset] = useState(0);
  const [dxCustom, setDxCustom] = useState("");
  const [dxIndication, setDxIndication] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const activeLabs = labs.filter((l) => LAB_ACTIVE.has(String(l.status || "")));
  const historyLabs = labs.filter((l) => !LAB_ACTIVE.has(String(l.status || "")));

  const orderLab = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    const testName = labTest === "OTHER" ? labCustom.trim() : labTest;
    if (!testName) {
      setErr("Enter a lab test name.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiCreateLabOrder({
        patientId,
        testName,
        category: "Laboratory",
        notes: labNotes.trim(),
      });
      if (res.error || res.success === false) {
        setErr(res.error || "Could not order lab");
        return;
      }
      setMsg(`Lab ordered: ${testName}`);
      setLabCustom("");
      setLabNotes("");
      await onSaved();
    } catch {
      setErr("Network error ordering lab");
    } finally {
      setSaving(false);
    }
  };

  const orderDx = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    const preset = DX_PRESETS[dxPreset];
    const studyName = dxCustom.trim() || preset?.studyName;
    if (!studyName) {
      setErr("Enter a study name.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiCreateDiagnosticOrder({
        patientId,
        studyName,
        modality: preset?.modality || "Other",
        bodyPart: preset?.bodyPart || "",
        indication: dxIndication.trim(),
        notes: dxIndication.trim(),
      });
      if (res.error || res.success === false) {
        setErr(res.error || "Could not order imaging");
        return;
      }
      setMsg(`Imaging ordered: ${studyName}`);
      setDxCustom("");
      setDxIndication("");
      await onSaved();
    } catch {
      setErr("Network error ordering imaging");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {(err || msg) && (
        <div
          className={`rounded-lg px-3 py-2 text-xs ${
            err ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}
        >
          {err || msg}
        </div>
      )}

      <div className={`grid gap-3 ${showLab && showDx ? "lg:grid-cols-2" : ""}`}>
        {showLab && (
        <section className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b bg-[#f8f6fa] px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              Order laboratory
            </h3>
          </div>
          <form onSubmit={orderLab} className="space-y-2 p-3">
            <select
              value={labTest}
              onChange={(e) => setLabTest(e.target.value)}
              className="h-10 w-full rounded-lg border px-2 text-sm"
            >
              {LAB_PRESETS.map((t) => (
                <option key={t}>{t}</option>
              ))}
              <option value="OTHER">Other / custom</option>
            </select>
            {labTest === "OTHER" && (
              <input
                value={labCustom}
                onChange={(e) => setLabCustom(e.target.value)}
                placeholder="Test name"
                className="h-10 w-full rounded-lg border px-2 text-sm"
                required
              />
            )}
            <input
              value={labNotes}
              onChange={(e) => setLabNotes(e.target.value)}
              placeholder="Clinical indication (optional)"
              className="h-10 w-full rounded-lg border px-2 text-sm"
            />
            <button
              type="submit"
              disabled={saving}
              className="h-10 w-full rounded-lg bg-[#c2183a] text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Ordering…" : "Order lab"}
            </button>
            <Link href="/labs" className="block text-center text-[11px] font-medium text-[#c2183a]">
              Open lab queue
            </Link>
          </form>
        </section>
        )}

        {showDx && (
        <section className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b bg-[#f8f6fa] px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              Order imaging / diagnostics
            </h3>
          </div>
          <form onSubmit={orderDx} className="space-y-2 p-3">
            <select
              value={dxPreset}
              onChange={(e) => setDxPreset(Number(e.target.value))}
              className="h-10 w-full rounded-lg border px-2 text-sm"
            >
              {DX_PRESETS.map((d, i) => (
                <option key={d.studyName} value={i}>
                  {d.studyName} ({d.modality})
                </option>
              ))}
            </select>
            <input
              value={dxCustom}
              onChange={(e) => setDxCustom(e.target.value)}
              placeholder="Override study name (optional)"
              className="h-10 w-full rounded-lg border px-2 text-sm"
            />
            <input
              value={dxIndication}
              onChange={(e) => setDxIndication(e.target.value)}
              placeholder="Clinical indication (optional)"
              className="h-10 w-full rounded-lg border px-2 text-sm"
            />
            <button
              type="submit"
              disabled={saving}
              className="h-10 w-full rounded-lg bg-[#140a1f] text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Ordering…" : "Order imaging"}
            </button>
            <Link
              href="/diagnostics"
              className="block text-center text-[11px] font-medium text-[#c2183a]"
            >
              Open diagnostics
            </Link>
          </form>
        </section>
        )}
      </div>

      <div className={`grid gap-3 ${showLab && showDx ? "lg:grid-cols-2" : ""}`}>
        {showLab && (
        <section className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b bg-[#f8f6fa] px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              Active labs
            </h3>
          </div>
          <div className="p-3">
            {activeLabs.length === 0 ? (
              <p className="text-xs text-gray-400">No active lab orders.</p>
            ) : (
              <ul className="divide-y text-xs">
                {activeLabs.map((l: any) => (
                  <li key={l.id} className="flex justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium">{l.testName}</p>
                      <p className="text-gray-500">{l.category || "Lab"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-medium">{l.status}</p>
                      <p className="text-gray-500">{formatIst(l.orderedAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        )}

        <section className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b bg-[#f8f6fa] px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              {focus === "lab"
                ? "Lab history"
                : focus === "radiology"
                  ? "Imaging history"
                  : "Lab history / imaging"}
            </h3>
          </div>
          <div className="max-h-64 space-y-2 overflow-auto p-3">
            {showLab &&
              historyLabs.slice(0, 12).map((l: any) => (
              <div key={l.id} className="border-b pb-2 text-xs last:border-0">
                <div className="flex justify-between gap-2">
                  <p className="font-medium">{l.testName}</p>
                  <span className="text-gray-500">{l.status}</span>
                </div>
                {l.result && (
                  <p className="mt-0.5 whitespace-pre-wrap text-gray-600">{l.result}</p>
                )}
                <div className="mt-1 flex gap-2">
                  <span className="text-gray-400">{formatIst(l.orderedAt)}</span>
                  <Link
                    href={`/labs/print?id=${encodeURIComponent(l.id)}`}
                    className="font-medium text-[#c2183a]"
                  >
                    Print
                  </Link>
                </div>
              </div>
            ))}
            {showDx &&
              diagnostics.map((d: any) => (
              <div key={d.id} className="border-b pb-2 text-xs last:border-0">
                <div className="flex justify-between gap-2">
                  <p className="font-medium">
                    {d.studyName}
                    {d.modality ? ` (${d.modality})` : ""}
                  </p>
                  <span className="text-gray-500">{d.status}</span>
                </div>
                <p className="text-gray-400">{formatIst(d.orderedAt || d.createdAt)}</p>
              </div>
            ))}
            {((showLab && historyLabs.length === 0) || !showLab) &&
              ((showDx && diagnostics.length === 0) || !showDx) && (
              <p className="text-xs text-gray-400">
                {focus === "lab"
                  ? "No completed labs yet."
                  : focus === "radiology"
                    ? "No imaging orders yet."
                    : "No completed labs or imaging yet."}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
