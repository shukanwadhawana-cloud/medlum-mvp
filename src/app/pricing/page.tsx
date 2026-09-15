"use client";

import { useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { BillingInterval, formatInr, priceFor, SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function choosePlan(id: string) {
    setSelected(id);
    if (id === "pilot") { setNote("Pilot selected. No payment is required."); return; }

    const paymentWindow = window.open("about:blank", "_blank");
    if (!paymentWindow) { setNote("Please allow pop-ups for MedLum so Razorpay can open in a separate tab."); return; }
    setLoadingPlan(id); setNote(`Preparing Razorpay Test Mode for ${id} (${interval})…`);
    try {
      const response = await fetch("/api/payments/razorpay/payment-link", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: id, interval }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.paymentLink) {
        paymentWindow.close();
        throw new Error(data.error || data.details || "Could not create the Razorpay Test Mode payment page.");
      }
      paymentWindow.location.href = data.paymentLink;
      setNote(`Razorpay Test Mode opened in a separate tab for ${id} (${interval}).`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not open Razorpay Test Mode.");
    } finally { setLoadingPlan(null); }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/dashboard" className="text-xs text-[#c2183a]">← Dashboard</Link>
        <h1 className="mt-1 text-2xl font-bold">Pricing & subscription</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">Choose a plan and billing cycle. Paid-plan selection opens a hosted Razorpay Test Mode payment page in a separate tab. Recurring subscription billing is not activated yet.</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Billing cycle</span>
        <button type="button" onClick={() => setInterval("monthly")} className={`h-9 rounded-full border px-4 text-xs font-medium ${interval === "monthly" ? "border-[#140a1f] bg-[#140a1f] text-white" : "bg-white"}`}>Monthly</button>
        <button type="button" onClick={() => setInterval("yearly")} className={`h-9 rounded-full border px-4 text-xs font-medium ${interval === "yearly" ? "border-[#140a1f] bg-[#140a1f] text-white" : "bg-white"}`}>Yearly (save ~17%)</button>
      </div>

      {note && <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">{note}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const amount = priceFor(plan, interval); const isLoading = loadingPlan === plan.id;
          return <section key={plan.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${plan.popular ? "ring-2 ring-[#c2183a]" : ""} ${selected === plan.id ? "border-[#c2183a]" : ""}`}>
            {plan.popular && <div className="mb-2 inline-block rounded-full bg-[#c2183a]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#c2183a]">Most popular</div>}
            <h2 className="text-lg font-bold">{plan.name}</h2><p className="mt-1 text-xs text-gray-500">{plan.tagline}</p>
            <div className="mt-4"><span className="text-3xl font-bold">{formatInr(amount)}</span>{amount > 0 && <span className="text-sm text-gray-500">/{interval === "yearly" ? "year" : "month"}</span>}{interval === "yearly" && plan.yearlySavePct > 0 && amount > 0 && <div className="mt-1 text-xs font-medium text-green-700">Save ~{plan.yearlySavePct}% vs monthly</div>}</div>
            <ul className="mt-4 space-y-1.5 text-sm text-gray-700">{plan.features.map((f) => <li key={f} className="flex gap-2"><span className="text-green-600">✓</span><span>{f}</span></li>)}</ul>
            <ul className="mt-3 space-y-1 text-xs text-gray-500">{plan.limits.map((l) => <li key={l}>• {l}</li>)}</ul>
            <button type="button" onClick={() => void choosePlan(plan.id)} disabled={Boolean(loadingPlan)} className={`mt-5 h-11 w-full rounded-xl text-sm font-medium disabled:opacity-60 ${plan.id === "pilot" ? "border bg-white" : "bg-[#140a1f] text-white"}`}>{isLoading ? "Opening Razorpay…" : plan.id === "pilot" ? "Continue on Pilot" : "Pay with Razorpay"}</button>
          </section>;
        })}
      </div>

      <section className="mt-8 rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">Current billing status</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-700"><li>Choose Monthly or Yearly.</li><li>Select a paid plan and MedLum creates a Razorpay hosted Test Mode payment page.</li><li>The Razorpay payment page opens in a separate browser tab; MedLum stays open in the original tab.</li><li>Recurring auto-renew is still a separate subscription integration and is not created by this test payment.</li></ol>
      </section>
    </AppShell>
  );
}
