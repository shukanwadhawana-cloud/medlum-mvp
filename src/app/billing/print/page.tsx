"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatIst } from "@/lib/time";

function PrintInner() {
  const sp = useSearchParams();
  const id = sp.get("id") || "";
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!id) {
      setErr("Missing invoice id");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/invoices/print?id=${encodeURIComponent(id)}`, { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json.printable) {
          setErr(json.error || "Could not load invoice");
          return;
        }
        setData(json.printable);
      } catch {
        setErr("Network error");
      }
    })();
  }, [id]);

  if (err) {
    return (
      <div className="p-6">
        <p className="text-red-600">{err}</p>
        <Link href="/billing" className="text-[#c2183a] text-sm">
          ← Billing
        </Link>
      </div>
    );
  }
  if (!data) return <p className="p-6 text-sm text-gray-500">Loading receipt…</p>;

  const h = data.hospital || {};
  const inv = data.invoice || {};
  const letterheadMm = typeof h.letterheadHeightMm === "number" ? h.letterheadHeightMm : 40;
  const showMedlumFooter = h.showMedlumFooter !== false;
  const money = (n: number) =>
    `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-lg bg-white p-6 text-[#140a1f] print:p-4">
      <div className="mb-4 flex items-start justify-between gap-3 print:hidden">
        <Link href="/billing" className="text-sm text-[#c2183a]">
          ← Billing
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-[#c2183a] px-3 py-2 text-sm font-semibold text-white"
        >
          Print
        </button>
      </div>

      {/* Reserved for pre-printed hospital letterhead — do not put MedLum branding here */}
      <div
        className="w-full print:block"
        style={{ height: `${letterheadMm}mm`, minHeight: `${letterheadMm}mm` }}
        aria-hidden
      />

      {/* Screen-only hospital identity (physical letterhead covers this when printing) */}
      <header className="border-b pb-3 print:hidden">
        <h1 className="text-lg font-bold">{h.name || "Hospital"}</h1>
        {h.address && <p className="text-xs text-gray-600">{h.address}</p>}
        <p className="text-xs text-gray-600">{[h.phone, h.email].filter(Boolean).join(" · ")}</p>
        {h.registrationNo && <p className="text-[10px] text-gray-500">Reg. {h.registrationNo}</p>}
      </header>

      <div className="mt-3 flex justify-between text-sm">
        <div>
          <p className="font-semibold">{inv.patientName}</p>
          {inv.patient?.uhid && <p className="text-xs text-gray-500">UHID {inv.patient.uhid}</p>}
          {inv.patient?.registrationNo && (
            <p className="text-xs text-gray-500">Reg {inv.patient.registrationNo}</p>
          )}
          <p className="text-xs text-gray-500">Invoice {inv.invoiceNumber || inv.id}</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>{inv.createdAt ? formatIst(inv.createdAt) : ""}</p>
          <p className="font-medium text-[#140a1f]">{inv.status}</p>
        </div>
      </div>

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs text-gray-500">
            <th className="py-1">Service</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Rate</th>
            <th className="py-1 text-right">Amt</th>
          </tr>
        </thead>
        <tbody>
          {(data.lines || []).map((l: any, i: number) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-1.5">
                {l.description}
                {l.category && <span className="block text-[10px] text-gray-400">{l.category}</span>}
              </td>
              <td className="py-1.5 text-right">{l.quantity}</td>
              <td className="py-1.5 text-right">{money(l.billedRate ?? l.unitPrice)}</td>
              <td className="py-1.5 text-right">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Total</span>
          <b>{money(inv.total)}</b>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Paid</span>
          <span>{money(inv.paid)}</span>
        </div>
        <div className="flex justify-between">
          <span>Balance</span>
          <b>{money(inv.balance)}</b>
        </div>
      </div>

      {(data.payments || []).length > 0 && (
        <div className="mt-4 border-t pt-2">
          <p className="text-xs font-semibold uppercase text-gray-500">Payments</p>
          {(data.payments || []).map((p: any) => (
            <p key={p.id} className="text-xs text-gray-600">
              {money(p.amount)} · {p.method}
              {p.paidAt ? ` · ${formatIst(p.paidAt)}` : ""}
            </p>
          ))}
        </div>
      )}

      {h.invoiceFooter && <p className="mt-4 text-[10px] text-gray-500">{h.invoiceFooter}</p>}
      {inv.tariffVersionName && <p className="mt-2 text-[10px] text-gray-400">Tariff: {inv.tariffVersionName}</p>}

      {showMedlumFooter && (
        <p className="mt-6 text-center text-[9px] tracking-wide text-gray-400">Powered by MedLum</p>
      )}
    </div>
  );
}

export default function InvoicePrintPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <PrintInner />
    </Suspense>
  );
}
