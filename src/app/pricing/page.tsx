"use client";

import { useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { BillingInterval, formatInr, priceFor, SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function choosePlan(id: string) {
    setSelected(id);
    setNote(
      `You selected ${id} (${interval}). Auto-renew billing gateway (Razorpay/Stripe) will connect here next — for now this records your intent in the pilot.`
    );
  }

  return (
    <AppShell>
      <div className="mb-6">
        <Link href="/dashboard" className="text-xs text-[#c2183a]">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Pricing & subscription</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          MedLum uses an <strong>auto-subscription</strong> model: pick a plan, it renews monthly or yearly until you
          cancel. Pilot stays free while you validate clinical workflows.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Billing cycle</span>
        <button
          type="button"
          onClick={() => setInterval("monthly")}
          className={`h-9 rounded-full border px-4 text-xs font-medium ${
            interval === "monthly" ? "border-[#140a1f] bg-[#140a1f] text-white" : "bg-white"
          }`}
        >
          Monthly (auto-renew)
        </button>
        <button
          type="button"
          onClick={() => setInterval("yearly")}
          className={`h-9 rounded-full border px-4 text-xs font-medium ${
            interval === "yearly" ? "border-[#140a1f] bg-[#140a1f] text-white" : "bg-white"
          }`}
        >
          Yearly (auto-renew, save ~17%)
        </button>
      </div>

      {note && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">{note}</div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const amount = priceFor(plan, interval);
          const isSelected = selected === plan.id;
          return (
            <section
              key={plan.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm ${
                plan.popular ? "ring-2 ring-[#c2183a]" : ""
              } ${isSelected ? "border-[#c2183a]" : ""}`}
            >
              {plan.popular && (
                <div className="mb-2 inline-block rounded-full bg-[#c2183a]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#c2183a]">
                  Most popular
                </div>
              )}
              <h2 className="text-lg font-bold">{plan.name}</h2>
              <p className="mt-1 text-xs text-gray-500">{plan.tagline}</p>
              <div className="mt-4">
                <span className="text-3xl font-bold">{formatInr(amount)}</span>
                {amount > 0 && (
                  <span className="text-sm text-gray-500">/{interval === "yearly" ? "year" : "month"}</span>
                )}
                {interval === "yearly" && plan.yearlySavePct > 0 && amount > 0 && (
                  <div className="mt-1 text-xs font-medium text-green-700">Save ~{plan.yearlySavePct}% vs monthly</div>
                )}
              </div>
              <ul className="mt-4 space-y-1.5 text-sm text-gray-700">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-green-600">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-3 space-y-1 text-xs text-gray-500">
                {plan.limits.map((l) => (
                  <li key={l}>• {l}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => choosePlan(plan.id)}
                className={`mt-5 h-11 w-full rounded-xl text-sm font-medium ${
                  plan.id === "pilot"
                    ? "border bg-white"
                    : "bg-[#140a1f] text-white"
                }`}
              >
                {plan.id === "pilot" ? "Continue on Pilot" : isSelected ? "Selected" : "Choose plan"}
              </button>
            </section>
          );
        })}
      </div>

      <section className="mt-8 rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">How auto-subscription works</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-700">
          <li>Choose Monthly or Yearly billing.</li>
          <li>Select a plan. Payment gateway (Razorpay / UPI / card) attaches on production hardening.</li>
          <li>Subscription renews automatically until you cancel from Clinic settings.</li>
          <li>Pilot remains free for friend-test and workflow validation — no card required.</li>
        </ol>
        <p className="mt-3 text-xs text-gray-500">
          Need help choosing? See the{" "}
          <Link href="/help" className="font-medium text-[#c2183a]">
            Help center & FAQs
          </Link>
          .
        </p>
      </section>
    </AppShell>
  );
}
