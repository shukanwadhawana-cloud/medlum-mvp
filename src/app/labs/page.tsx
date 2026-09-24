"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiCreateLabOrder, apiGetLabOrders, apiGetPatients, apiUpdateLabOrder } from "@/lib/api";
import { LAB_CATALOG } from "@/lib/diagnostic-catalog";
import LabResultDocumentPanel from "@/components/LabResultDocumentPanel";
import { formatIst } from "@/lib/time";
import { parseCareSetting } from "@/lib/patient-metadata";

type Patient = { id: string; name: string; uhid?: string; registrationNo?: string; notes?: string };
type LabOrder = {
  id: string;
  patientId: string;
  patientName: string;
  testName: string;
  category: string;
  status: string;
  result: string;
  notes: string;
  orderedAt: string;
  resultedAt?: string | null;
  encounterId?: string | null;
  patientUhid?: string;
  patientRegistrationNo?: string;
  encounterType?: string;
};

const ACTIVE_STATUSES = new Set([
  "Ordered",
  "Collected",
  "Sample Pending",
  "Sample Collected",
  "Processing",
  "Result Available",
  "Awaiting Review",
]);
const HISTORY_STATUSES = new Set(["Resulted", "Reviewed", "Cancelled", "Completed"]);

function isActiveStatus(status: string) {
  if (HISTORY_STATUSES.has(status)) return false;
  if (ACTIVE_STATUSES.has(status)) return true;
  return status !== "Resulted" && status !== "Cancelled";
}

function isCbcTest(testName: string): boolean {
  const t = testName.toLowerCase();
  return t.includes("cbc") || t.includes("complete blood");
}

function parseStructuredResult(raw: string): Record<string, string> | null {
  const s = String(raw || "").trim();
  if (!s.startsWith("{")) return null;
  try {
    const obj = JSON.parse(s);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v == null) continue;
      out[String(k)] = String(v);
    }
    return out;
  } catch {
    return null;
  }
}

function formatResultPreview(raw: string): string {
  const structured = parseStructuredResult(raw);
  if (!structured) return raw || "—";
  return Object.entries(structured)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

function statusBadgeClass(status: string): string {
  if (status === "Ordered" || status === "Sample Pending") return "bg-amber-50 text-amber-800 border-amber-200";
  if (status === "Collected" || status === "Sample Collected" || status === "Processing")
    return "bg-blue-50 text-blue-800 border-blue-200";
  if (status === "Resulted" || status === "Result Available" || status === "Reviewed")
    return "bg-green-50 text-green-800 border-green-200";
  if (status === "Cancelled") return "bg-gray-100 text-gray-600 border-gray-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}

type PatientGroup = {
  patientId: string;
  patientName: string;
  uhid: string;
  registrationNo: string;
  encounterType: string;
  encounterId: string;
  orders: LabOrder[];
  pendingCount: number;
};

function resolveEncounterType(o: LabOrder): string {
  if (o.encounterType && o.encounterType.trim()) return o.encounterType.trim();
  if (o.encounterId) return "Encounter";
  return "Encounter not linked";
}

/** Group by patient + encounter so unrelated encounters are not merged. */
function groupByPatient(list: LabOrder[]): PatientGroup[] {
  const map = new Map<string, PatientGroup>();
  for (const o of list) {
    const key = `${o.patientId || o.patientName}::${o.encounterId || "none"}`;
    let g = map.get(key);
    if (!g) {
      g = {
        patientId: o.patientId,
        patientName: o.patientName,
        uhid: o.patientUhid || "",
        registrationNo: o.patientRegistrationNo || "",
        encounterType: resolveEncounterType(o),
        encounterId: o.encounterId || "",
        orders: [],
        pendingCount: 0,
      };
      map.set(key, g);
    }
    g.orders.push(o);
    if (isActiveStatus(o.status)) g.pendingCount += 1;
  }
  return Array.from(map.values()).sort(
    (a, b) => b.pendingCount - a.pendingCount || a.patientName.localeCompare(b.patientName)
  );
}

export default function LabsPage() {
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [queueTab, setQueueTab] = useState<"active" | "history">("active");
  const [careSetting, setCareSetting] = useState<"OPD" | "IPD">("OPD");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [resultOrder, setResultOrder] = useState<LabOrder | null>(null);
  const [documentOrder, setDocumentOrder] = useState<LabOrder | null>(null);
  const [form, setForm] = useState({ patientId: "", testName: "", category: "Laboratory", notes: "" });
  const [result, setResult] = useState("");
  const [cbcParams, setCbcParams] = useState<
    { id?: string; name: string; unit?: string | null; referenceRange?: string | null }[]
  >([]);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedTest = useMemo(() => LAB_CATALOG.find((item) => item.name === form.testName), [form.testName]);

  const load = useCallback(async () => {
    const [pts, list] = await Promise.all([apiGetPatients(), apiGetLabOrders()]);
    setPatients(pts as Patient[]);
    const byId = new Map((pts as Patient[]).map((p) => [p.id, p]));
    setOrders(
      (list as LabOrder[]).map((o) => {
        const p = byId.get(o.patientId);
        return {
          ...o,
          patientUhid: o.patientUhid || p?.uhid || "",
          patientRegistrationNo: o.patientRegistrationNo || p?.registrationNo || "",
        };
      })
    );
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) {
      router.replace("/login");
      return;
    }
    void load();
  }, [doctor, authLoading, router, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = orders.filter((o) => (queueTab === "active" ? isActiveStatus(o.status) : !isActiveStatus(o.status)));
    if (q) {
      list = list.filter(
        (o) =>
          o.patientName.toLowerCase().includes(q) ||
          (o.patientUhid || "").toLowerCase().includes(q) ||
          (o.patientRegistrationNo || "").toLowerCase().includes(q) ||
          o.testName.toLowerCase().includes(q) ||
          (o.encounterId || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, queueTab, search]);

  const visibleOrders = useMemo(() => {
    const patientById = new Map(patients.map((p) => [p.id, p]));
    return filtered.filter((o) => {
      const patient = patientById.get(o.patientId);
      const setting = parseCareSetting(patient?.notes || "") === "IPD" ? "IPD" : "OPD";
      return setting === careSetting;
    });
  }, [filtered, patients, careSetting]);

  const groups = useMemo(() => groupByPatient(visibleOrders), [visibleOrders]);

  const counts = useMemo(
    () => ({
      active: orders.filter((o) => isActiveStatus(o.status)).length,
      history: orders.filter((o) => !isActiveStatus(o.status)).length,
      ordered: orders.filter((o) => o.status === "Ordered").length,
      collected: orders.filter((o) => o.status === "Collected").length,
      resulted: orders.filter((o) => o.status === "Resulted").length,
    }),
    [orders]
  );

  async function openResultEntry(order: LabOrder) {
    setError("");
    setResultOrder(order);
    setCbcParams([]);
    setParamValues({});
    setResult("");
    if (isCbcTest(order.testName)) {
      try {
        const res = await fetch("/api/lab-templates?code=CBC", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        const template = data.template || data.templates?.[0];
        const params = template?.parameters || [];
        if (params.length > 0) {
          setCbcParams(params);
          const existing = parseStructuredResult(order.result) || {};
          const initial: Record<string, string> = {};
          for (const p of params) initial[p.name] = existing[p.name] || "";
          setParamValues(initial);
          return;
        }
      } catch {
        /* free-text fallback */
      }
    }
    setResult(order.result || "");
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    const r = await apiCreateLabOrder(form);
    if (r.success) {
      setShowAdd(false);
      setForm({ patientId: "", testName: "", category: "Laboratory", notes: "" });
      await load();
    } else setError(r.error || "Could not create lab order");
    setSaving(false);
  };

  const saveResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultOrder) return;
    setSaving(true);
    setError("");
    let payload = result;
    if (cbcParams.length > 0) {
      const structured: Record<string, string> = {};
      let any = false;
      for (const p of cbcParams) {
        const v = String(paramValues[p.name] || "").trim();
        if (v) {
          structured[p.name] = v;
          any = true;
        }
      }
      if (!any) {
        setError("Enter at least one CBC parameter value.");
        setSaving(false);
        return;
      }
      payload = JSON.stringify(structured);
    } else if (!String(payload || "").trim()) {
      setError("Enter a result.");
      setSaving(false);
      return;
    }
    const r = await apiUpdateLabOrder({ id: resultOrder.id, status: "Resulted", result: payload });
    if (r.success) {
      setResultOrder(null);
      setResult("");
      setCbcParams([]);
      setParamValues({});
      await load();
    } else setError(r.error || "Could not save result");
    setSaving(false);
  };

  if (authLoading) {
    return (
      <AppShell>
        <p className="text-sm text-gray-500">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Laboratory</h2>
          <p className="text-xs text-gray-500">Active work queue · history retained permanently</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError("");
            setShowAdd(true);
          }}
          disabled={!patients.length}
          className="h-9 rounded-lg bg-[#c2183a] px-3 text-sm font-medium text-white disabled:opacity-40"
        >
          + Order Test
        </button>
      </div>

      {error && !showAdd && !resultOrder && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-left">
          <p className="text-[11px] uppercase tracking-wide text-amber-700">Ordered</p>
          <p className="text-xl font-semibold text-amber-900">{counts.ordered}</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-left">
          <p className="text-[11px] uppercase tracking-wide text-blue-700">Collected</p>
          <p className="text-xl font-semibold text-blue-900">{counts.collected}</p>
        </div>
        <div className="rounded-xl border border-green-100 bg-green-50 p-3 text-left">
          <p className="text-[11px] uppercase tracking-wide text-green-700">Resulted</p>
          <p className="text-xl font-semibold text-green-900">{counts.resulted}</p>
        </div>
      </div>

      <div className="mb-3 rounded-xl border bg-gray-50 p-1">
        <div className="grid grid-cols-2 gap-1" role="tablist" aria-label="Laboratory care setting">
          {(["OPD", "IPD"] as const).map((setting) => (
            <button
              key={setting}
              type="button"
              role="tab"
              aria-selected={careSetting === setting}
              onClick={() => setCareSetting(setting)}
              className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition ${
                careSetting === setting ? "bg-white text-[#140a1f] shadow-sm" : "text-gray-500"
              }`}
            >
              {setting}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setQueueTab("active")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            queueTab === "active" ? "bg-[#140a1f] text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Active work ({counts.active})
        </button>
        <button
          type="button"
          onClick={() => setQueueTab("history")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            queueTab === "history" ? "bg-[#140a1f] text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          History ({counts.history})
        </button>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, UHID, reg no, test…"
          className="min-h-9 min-w-[12rem] flex-1 rounded-lg border px-3 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        {groups.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            {queueTab === "active"
              ? `No active ${careSetting} laboratory work.`
              : `No historical ${careSetting} investigations in this view.`}
          </div>
        ) : (
          <div className="divide-y">
            {groups.map((g) => {
              const groupKey = `${g.patientId}::${g.encounterId || "none"}`;
              const open = expanded[groupKey] ?? (careSetting === "OPD");
              return (
                <div key={groupKey} className="p-3">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [groupKey]: !open }))}
                    className="flex w-full items-start justify-between gap-2 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#140a1f]">{g.patientName}</p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {g.uhid ? `UHID: ${g.uhid}` : g.registrationNo ? `Reg: ${g.registrationNo}` : "ID pending"}
                        {" · "}
                        <span className="font-medium text-gray-700">{g.encounterType}</span>
                        {g.encounterId ? ` · ${g.encounterId.slice(0, 8)}` : ""}
                        {" · "}
                        {g.orders.length} investigation{g.orders.length === 1 ? "" : "s"}
                        {g.pendingCount > 0 ? ` · ${g.pendingCount} pending` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-gray-400">{open ? "▾" : "▸"}</span>
                  </button>

                  {open && (
                    <div className="mt-2 space-y-1.5 border-l-2 border-gray-100 pl-3">
                      {g.orders.map((o) => (
                        <div
                          key={o.id}
                          className="flex items-start justify-between gap-2 rounded-lg bg-gray-50/80 px-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{o.testName}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                              <span className={`rounded border px-1.5 py-0.5 font-medium ${statusBadgeClass(o.status)}`}>
                                {o.status}
                              </span>
                              <span>{formatIst(o.orderedAt)}</span>
                            </p>
                            {o.result && queueTab === "history" && (
                              <p className="mt-1 text-[11px] text-gray-600">{formatResultPreview(o.result)}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col gap-1">
                            <Link href={`/patients/${o.patientId}`} className="text-center text-[11px] font-medium text-[#c2183a]">
                              Chart
                            </Link>
                            <Link href={`/labs/print?id=${encodeURIComponent(o.id)}`} className="text-center text-[11px] font-medium text-gray-600">
                              Print
                            </Link>
                            <button
                              type="button"
                              onClick={() => setDocumentOrder(o)}
                              className="rounded-lg border border-[#c2183a]/30 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#c2183a]"
                            >
                              Upload report
                            </button>
                            {isActiveStatus(o.status) && (
                              <button
                                type="button"
                                onClick={() => void openResultEntry(o)}
                                className="rounded-lg bg-[#c2183a] px-2.5 py-1.5 text-[11px] font-semibold text-white"
                              >
                                Enter result
                              </button>
                            )}
                            {o.status === "Ordered" && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiUpdateLabOrder({ id: o.id, status: "Collected" });
                                  await load();
                                }}
                                className="rounded-lg border bg-white px-2.5 py-1.5 text-[11px] font-medium"
                              >
                                Mark collected
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold">Order lab test</h3>
            {error && <div className="my-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={create} className="mt-3 space-y-2.5">
              <select
                required
                value={form.patientId}
                onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Select patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.uhid ? ` · ${p.uhid}` : ""}
                  </option>
                ))}
              </select>
              <select
                required
                value={form.testName}
                onChange={(e) => {
                  const test = LAB_CATALOG.find((item) => item.name === e.target.value);
                  setForm({ ...form, testName: e.target.value, category: test?.category || "Laboratory" });
                }}
                className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Select laboratory investigation</option>
                {LAB_CATALOG.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                    {item.isInpatientRoutine ? " · IPD routine" : ""}
                  </option>
                ))}
              </select>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes (optional)"
                className="min-h-16 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 rounded-lg border py-2 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-[#140a1f] py-2 text-sm text-white disabled:opacity-50">
                  {saving ? "Saving…" : "Create order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {documentOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Upload lab report</h3>
                <p className="text-xs text-gray-500">
                  {documentOrder.patientName} · {documentOrder.testName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDocumentOrder(null)}
                className="rounded-lg border px-2 py-1 text-xs"
              >
                Close
              </button>
            </div>
            <LabResultDocumentPanel
              labOrderId={documentOrder.id}
              patientId={documentOrder.patientId}
              onVerified={async () => {
                await load();
                setDocumentOrder(null);
              }}
            />
          </div>
        </div>
      )}

      {resultOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold">Enter result — {resultOrder.testName}</h3>
            <p className="text-xs text-gray-500">{resultOrder.patientName}</p>
            {error && <div className="my-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={saveResult} className="mt-3 space-y-2.5">
              {cbcParams.length > 0 ? (
                <div className="space-y-2">
                  {cbcParams.map((p) => (
                    <div key={p.name}>
                      <label className="text-[11px] text-gray-500">
                        {p.name}
                        {p.unit ? ` (${p.unit})` : ""}
                        {p.referenceRange ? ` · ref ${p.referenceRange}` : ""}
                      </label>
                      <input
                        value={paramValues[p.name] || ""}
                        onChange={(e) => setParamValues({ ...paramValues, [p.name]: e.target.value })}
                        className="min-h-10 w-full rounded-lg border px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <textarea
                  required
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  placeholder="Result text"
                  className="min-h-28 w-full rounded-lg border px-3 py-2 text-sm"
                />
              )}
              <LabResultDocumentPanel
                labOrderId={resultOrder.id}
                patientId={resultOrder.patientId}
                onVerified={async () => {
                  await load();
                  setResultOrder(null);
                }}
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setResultOrder(null)} className="flex-1 rounded-lg border py-2 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-[#c2183a] py-2 text-sm text-white disabled:opacity-50">
                  {saving ? "Saving…" : "Save result"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
