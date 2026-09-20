"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useDoctor } from "@/components/DoctorProvider";
import { apiCreateLabOrder, apiGetLabOrders, apiGetPatients, apiUpdateLabOrder } from "@/lib/api";
import { LAB_CATALOG } from "@/lib/diagnostic-catalog";

type Patient = { id: string; name: string };
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
};
type TemplateParam = {
  id?: string;
  name: string;
  unit?: string | null;
  referenceRange?: string | null;
  displayOrder?: number;
};

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

export default function LabsPage() {
  const router = useRouter();
  const { doctor, loading: authLoading } = useDoctor();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [resultOrder, setResultOrder] = useState<LabOrder | null>(null);
  const [form, setForm] = useState({ patientId: "", testName: "", category: "Laboratory", notes: "" });
  const [result, setResult] = useState("");
  const [cbcParams, setCbcParams] = useState<TemplateParam[]>([]);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedTest = useMemo(() => LAB_CATALOG.find((item) => item.name === form.testName), [form.testName]);

  const load = useCallback(async () => {
    const [pts, list] = await Promise.all([apiGetPatients(), apiGetLabOrders()]);
    setPatients(pts as Patient[]);
    setOrders(list as LabOrder[]);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) {
      router.replace("/login");
      return;
    }
    void load();
  }, [doctor, authLoading, router, load]);

  const visible = useMemo(() => (filter === "all" ? orders : orders.filter((o) => o.status === filter)), [orders, filter]);
  const counts = useMemo(
    () => ({
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
        const params: TemplateParam[] = template?.parameters || [];
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
          <p className="text-xs text-gray-500">Orders and results linked to the clinical record</p>
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
        <button type="button" onClick={() => setFilter("Ordered")} className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-left">
          <p className="text-[11px] uppercase tracking-wide text-amber-700">Ordered</p>
          <p className="text-xl font-semibold text-amber-900">{counts.ordered}</p>
        </button>
        <button type="button" onClick={() => setFilter("Collected")} className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-left">
          <p className="text-[11px] uppercase tracking-wide text-blue-700">Collected</p>
          <p className="text-xl font-semibold text-blue-900">{counts.collected}</p>
        </button>
        <button type="button" onClick={() => setFilter("Resulted")} className="rounded-xl border border-green-100 bg-green-50 p-3 text-left">
          <p className="text-[11px] uppercase tracking-wide text-green-700">Resulted</p>
          <p className="text-xl font-semibold text-green-900">{counts.resulted}</p>
        </button>
      </div>

      <div className="mb-2 flex gap-2 text-xs">
        <button type="button" onClick={() => setFilter("all")} className={`rounded-full px-2.5 py-1 ${filter === "all" ? "bg-[#140a1f] text-white" : "bg-gray-100"}`}>
          All
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        {visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No lab orders yet.</div>
        ) : (
          <div className="divide-y">
            {visible.map((o) => (
              <div key={o.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{o.testName}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {o.patientName} · {o.status}
                    </p>
                    {o.result && <p className="mt-1 text-xs text-gray-600">{formatResultPreview(o.result)}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Link href={`/patients/${o.patientId}`} className="text-center text-[11px] font-medium text-[#c2183a]">
                      Chart
                    </Link>
                    {o.status !== "Resulted" && o.status !== "Cancelled" && (
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
                        className="rounded-lg border px-2.5 py-1.5 text-[11px] font-medium"
                      >
                        Mark collected
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
              {selectedTest?.components?.length ? (
                <div className="rounded-lg border bg-gray-50 p-2 text-[11px] text-gray-600">
                  <p>
                    <b>Includes:</b> {selectedTest.components.join(", ")}
                  </p>
                </div>
              ) : null}
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Clinical note / instructions (optional)"
                className="min-h-20 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAdd(false)} className="h-11 flex-1 rounded-lg border text-sm">
                  Cancel
                </button>
                <button disabled={saving} className="h-11 flex-1 rounded-lg bg-[#c2183a] text-sm text-white disabled:opacity-60">
                  {saving ? "Ordering…" : "Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resultOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold">Enter Result</h3>
            <p className="mt-1 text-xs text-gray-500">
              {resultOrder.patientName} · {resultOrder.testName}
            </p>
            {error && <div className="my-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={saveResult} className="mt-3 space-y-2.5">
              {cbcParams.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">CBC parameters</p>
                  {cbcParams.map((p) => (
                    <label key={p.name} className="block text-xs text-gray-600">
                      <span className="font-medium text-[#140a1f]">
                        {p.name}
                        {p.unit ? ` (${p.unit})` : ""}
                      </span>
                      {p.referenceRange && <span className="ml-1 text-[10px] text-gray-400">Ref: {p.referenceRange}</span>}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={paramValues[p.name] || ""}
                        onChange={(e) => setParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
                        className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"
                        placeholder="Value"
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  required
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  placeholder="Enter result / interpretation"
                  className="min-h-32 w-full rounded-lg border px-3 py-2 text-sm"
                />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResultOrder(null);
                    setCbcParams([]);
                  }}
                  className="h-11 flex-1 rounded-lg border text-sm"
                >
                  Cancel
                </button>
                <button disabled={saving} className="h-11 flex-1 rounded-lg bg-[#c2183a] text-sm text-white disabled:opacity-60">
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
