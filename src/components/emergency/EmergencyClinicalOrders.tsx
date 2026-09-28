"use client";

import { useMemo, useState } from "react";
import { EXPANDED_LAB_CATALOG, EXPANDED_RADIOLOGY_CATALOG } from "@/lib/diagnostic-catalog";
import MedOrderPanel from "@/components/ipd/MedOrderPanel";

type Props = {
  caseId: string;
  patient: { id: string; name: string };
};

export default function EmergencyClinicalOrders({ caseId, patient }: Props) {
  const [tab, setTab] = useState<"lab" | "diagnostic">("lab");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const catalogue = tab === "lab" ? EXPANDED_LAB_CATALOG : EXPANDED_RADIOLOGY_CATALOG;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalogue;
    return catalogue.filter((x: any) =>
      [x.name, x.category, x.modality].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [catalogue, search]);

  function toggle(item: any) {
    setSelected((prev) =>
      prev.some((x) => x.id === item.id) ? prev.filter((x) => x.id !== item.id) : [...prev, item]
    );
  }

  async function placeOrder() {
    if (!selected.length) return;
    setSaving(true);
    setMsg("");
    setError("");
    const context = `Emergency case ${caseId}`;
    try {
      const results = await Promise.all(
        selected.map((item) =>
          tab === "lab"
            ? fetch("/api/labs", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
                body: JSON.stringify({
                  patientId: patient.id,
                  testName: item.name,
                  category: item.category,
                  notes: [context, notes.trim()].filter(Boolean).join(" · "),
                }),
              })
            : fetch("/api/diagnostics", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", "X-MedLum-Requested-With": "MedLum" },
                body: JSON.stringify({
                  patientId: patient.id,
                  studyName: item.name,
                  modality: item.modality || "Other",
                  bodyPart: item.bodyPart || "",
                  indication: notes.trim(),
                  notes: context,
                }),
              })
        )
      );
      const bodies = await Promise.all(results.map((r) => r.json().catch(() => ({}))));
      const failed = bodies.find((body) => body.success === false || body.error);
      if (failed) throw new Error(failed.error || `Could not place ${tab} order`);
      setMsg(`${selected.length} ${tab === "lab" ? "laboratory" : "diagnostic"} order${selected.length === 1 ? "" : "s"} placed for this emergency case.`);
      setSelected([]);
      setNotes("");
    } catch (e: any) {
      setError(e.message || "Could not place order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border bg-slate-50 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Clinical Orders</h4>
          <p className="text-[10px] text-gray-500">Patient-linked orders retained in the existing laboratory, diagnostics and medication workflows.</p>
        </div>
        <span className="rounded-full border bg-white px-2 py-1 text-[10px] text-gray-500">Case {caseId.slice(0, 8)}…</span>
      </div>

      {(msg || error) && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {error || msg}
        </div>
      )}

      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="flex border-b bg-slate-50">
          <button type="button" onClick={() => { setTab("lab"); setSelected([]); setSearch(""); }} className={`flex-1 px-3 py-2 text-xs font-semibold ${tab === "lab" ? "bg-white text-[#c2183a] border-b-2 border-[#c2183a]" : "text-gray-600"}`}>
            Order Laboratory
          </button>
          <button type="button" onClick={() => { setTab("diagnostic"); setSelected([]); setSearch(""); }} className={`flex-1 px-3 py-2 text-xs font-semibold ${tab === "diagnostic" ? "bg-white text-[#c2183a] border-b-2 border-[#c2183a]" : "text-gray-600"}`}>
            Order Diagnostics / Imaging
          </button>
        </div>
        <div className="p-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab === "lab" ? "laboratory tests" : "diagnostics / imaging"}…`} className="h-9 w-full rounded-lg border px-3 text-xs" />
          <div className="mt-2 max-h-56 overflow-auto grid sm:grid-cols-2 gap-2">
            {visible.map((item: any) => (
              <button type="button" key={item.id || item.name} onClick={() => toggle(item)} className={`text-left rounded-lg border p-2 ${selected.some((x) => x.id === item.id) ? "border-[#c2183a] bg-red-50" : "bg-white"}`}>
                <p className="text-[11px] font-semibold">{item.name}</p>
                <p className="mt-0.5 text-[9px] text-gray-500">{item.category}{item.modality ? ` · ${item.modality}` : ""}</p>
              </button>
            ))}
          </div>
          {!visible.length && <p className="p-5 text-center text-xs text-gray-500">No matching investigations.</p>}
          <div className="mt-3 border-t pt-3">
            <p className="text-[10px] font-semibold text-gray-500">Selected: {selected.length}</p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical indication / order notes" className="mt-2 w-full min-h-14 rounded-lg border px-3 py-2 text-xs" />
            <button type="button" onClick={placeOrder} disabled={saving || !selected.length} className="mt-2 h-9 rounded-lg bg-[#c2183a] px-4 text-xs font-semibold text-white disabled:opacity-50">
              {saving ? "Placing…" : `Place ${tab === "lab" ? "laboratory" : "diagnostic"} order${selected.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>

      <MedOrderPanel
        patient={patient}
        contextNote={`Emergency case ${caseId}`}
      />
    </div>
  );
}
